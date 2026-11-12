// 상주 감시꾼 — 원천 파일이 바뀌면 3초 모아 한 번 싣는다(publish.mjs 의 「2분 시계」를 「바뀌면 즉시」로).
// node board/reporter/watch.mjs   (의존성 0 · fs.watch recursive — macOS·Windows)
// · 같으면 안 싣는다: 직전 성공 스냅숏의 해시(매번 바뀌는 시각 칸 뺀 것)를 last-hash.json(last-sink.json 옆)에 두고 비교.
// · 2분 타이머는 예비(놓친 변화 따라잡기) — 같은 규칙(해시 같으면 건너뜀).
// · 해시가 같아도 마지막 성공 싣기가 20분 넘었으면 한 번 싣는다 — 「자료 싣기」 표지(sinkService)는 30분 넘게 기록이 없으면 「멈춤」으로 읽는다.
// · 두 기기가 같이 돌면 나중에 끝난 쪽이 이김(sink.mjs 그대로).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, watch as fsWatch, writeFileSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, checkServices } from './snapshot.mjs'
import { findDirty } from './plain.mjs'
import { loadConfig } from './config.mjs'
import { tokensByToolUse } from './tokens.mjs'
import { readToken, readRef, sinkAndLog } from './sink.mjs'

export const DEBOUNCE_MS = 3000
export const BACKUP_MS = 120000
export const HEARTBEAT_MS = 20 * 60e3

/** 해시용 직렬화 — 매번 바뀌는 칸(checked_at · 지금 시각 그대로인 문자열)을 뺀다. 나머지 시각(레인 노트에서 온 것·한도 reset)은 실제 변화라 둔다. */
export function snapshotHash(snap, nowIso) {
  const text = JSON.stringify(snap, (k, v) => (k === 'checked_at' ? undefined : v === nowIso ? '~now' : v))
  return createHash('sha256').update(text).digest('hex')
}

export const hashPath = (cfg) => join(dirname(cfg.sinkState), 'last-hash.json')
export function readHashRec(path) { try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return null } }
export function writeHashRec(path, rec) { try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(rec)) } catch { /* 기록 실패는 무시 — 다음에 한 번 더 실을 뿐 */ } }

/** 한 번 돌기: 스냅숏 → 해시 같으면 건너뜀 → 아니면 싣기, 성공일 때만 해시 기록. 반환 'skip' | 코드(0 성공·1 실패·3 자격 없음). */
export async function runCycle({ makeSnap, sinkFn, readRec, writeRec, now = () => new Date(), log = console.log }) {
  const at = now()
  const nowIso = at.toISOString()
  const snap = await makeSnap(at)
  const dirty = findDirty(snap)
  if (dirty) { log(`담백 검사 실패: ${dirty}`); return 1 }
  const hash = snapshotHash(snap, nowIso)
  const rec = readRec()
  if (rec?.hash === hash && at.getTime() - Date.parse(rec.at) < HEARTBEAT_MS) { log('같음 — 건너뜀'); return 'skip' }
  const code = await sinkFn(snap)
  if (code === 0) writeRec({ hash, at: nowIso })
  return code
}

/** 감시 제어: 바뀜 → 마지막 바뀜 뒤 debounceMs 에 한 번 · 실행 중 바뀜 → 끝나고 한 번 더 · 예비 타이머. 시계·감시는 주입(시험용). */
export function createWatcher({ targets, exec, watch = fsWatch, debounceMs = DEBOUNCE_MS, backupMs = BACKUP_MS, log = console.log }) {
  let timer = null
  let backup = null
  let running = false
  let again = false
  const handles = []
  async function fire() {
    if (running) { again = true; return }
    running = true
    try { await exec() } catch (e) { log(`실행 오류: ${e instanceof Error ? e.message : e}`.slice(0, 300)) }
    running = false
    if (again) { again = false; await fire() }
  }
  function touch() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void fire() }, debounceMs)
  }
  return {
    touch, fire,
    start() {
      for (const t of targets) {
        try {
          const h = watch(t.dir, { recursive: !!t.recursive }, (_ev, name) => { if (!t.filter || t.filter(name == null ? '' : String(name))) touch() })
          h.on?.('error', (e) => log(`감시 오류 ${t.dir}: ${e.message}`))
          handles.push(h)
        } catch (e) { log(`감시 못 걸음 ${t.dir}: ${e instanceof Error ? e.message : e}`.slice(0, 300)) }
      }
      backup = setInterval(() => void fire(), backupMs)
    },
    stop() { if (timer) clearTimeout(timer); if (backup) clearInterval(backup); for (const h of handles) h.close?.() },
  }
}

const isDir = (p) => { try { return statSync(p).isDirectory() } catch { return false } }

/** 감시 원천 — snapshot 이 읽는 자리 그대로(설정에서 가져온다). 토큰 로그(projects)는 대화마다 쉼 없이 바뀌어 감시하지 않고 예비 타이머가 줍는다. */
export function sourceTargets(cfg, repoDir, exists = existsSync, dirTest = isDir) {
  const md = (n) => n.endsWith('.md') || n === ''
  const out = []
  const dirs = new Set()
  const add = (dir, recursive, filter) => { if (dir && exists(dir) && !dirs.has(dir)) { dirs.add(dir); out.push({ dir, recursive, filter }) } }
  add(cfg.laneRoot, true, md) // 레인 폴더(레인 노트·요청함·작업현황판·「집은 카드」 표 포함)
  for (const f of [cfg.lane, cfg.requests]) if (f && !String(f).startsWith(String(cfg.laneRoot ?? '\0'))) add(dirname(f), false, (n) => n === basename(f) || n === '')
  for (const f of [cfg.usage, cfg.gate]) add(f && dirname(f), false, (n) => n === basename(f) || n === '') // 한도 파일 · 문지기 actors.json
  const heads = join(repoDir, '.git', 'refs', 'heads') // 가지 목록(줄기·가지 커밋 시각)
  if (dirTest(heads)) add(heads, true)
  return out
}

async function main() {
  const repoDir = fileURLToPath(new URL('../..', import.meta.url))
  const cfg = loadConfig()
  const stamp = () => new Date().toISOString()
  const log = (m) => console.log(`${stamp()} ${m}`)
  const exec = () => runCycle({
    makeSnap: async (now) => build({
      lanePath: cfg.lane, requestPath: cfg.requests, laneRoot: cfg.laneRoot, repoDir, now,
      onWarn: (d, why) => console.warn('경고', d, why),
      usagePath: cfg.usage, gatePath: cfg.gate, tokens: tokensByToolUse(cfg.projects),
      services: await checkServices(repoDir, now, cfg.sinkState),
    }),
    sinkFn: (snap) => sinkAndLog(snap, { token: readToken(), ref: readRef(cfg), statePath: cfg.sinkState }, log),
    readRec: () => readHashRec(hashPath(cfg)),
    writeRec: (r) => writeHashRec(hashPath(cfg), r),
    log,
  }).then((r) => { if (r !== 'skip' && r !== 0) log(`결과 코드 ${r}`) })
  const targets = sourceTargets(cfg, repoDir)
  const w = createWatcher({ targets, exec, log })
  log(`감시 시작 — 원천 ${targets.length}곳`)
  w.start()
  void w.fire() // 시작하자마자 한 번
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { w.stop(); process.exit(0) })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
