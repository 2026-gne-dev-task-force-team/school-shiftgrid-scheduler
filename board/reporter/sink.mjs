// 싣개: 스냅숏 → SQL → 이 기기에서 바로 Supabase Management API 로 싣는다(git 을 거치지 않는다).
// 싣기는 표마다 delete + insert 를 한 트랜잭션으로 묶은 「통째 교체」라 멱등이다 — 같은 스냅숏을 몇 번 올려도 같다.
// 두 기기가 같이 돌면 나중에 끝난 쪽이 이긴다(엉키지 않음, 마지막 값이 남음).
// 로그엔 응답 코드와 표별 줄 수만. TOKEN 은 변수로만 받고 찍지 않는다.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { toSql, TABLES } from './to-sql.mjs'

export class NoCredential extends Error {}

// 자격 읽는 순서: 환경변수 BOARD_SUPABASE_TOKEN → 맥 키체인 → 윈도우 %LOCALAPPDATA%\board-reporter\token. 값은 돌려주기만 한다.
export function readToken({ env = process.env, os = process.platform, run = execFileSync, exists = existsSync, read = readFileSync } = {}) {
  if (env.BOARD_SUPABASE_TOKEN?.trim()) return env.BOARD_SUPABASE_TOKEN.trim()
  if (os === 'darwin') {
    try {
      const v = run('security', ['find-generic-password', '-a', env.USER ?? '', '-s', 'board-reporter-supabase', '-w'],
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (v) return v
    } catch { /* 키체인에 없음 */ }
  } else if (os === 'win32' && env.LOCALAPPDATA) {
    const p = join(env.LOCALAPPDATA, 'board-reporter', 'token')
    if (exists(p)) { const v = String(read(p, 'utf-8')).trim(); if (v) return v }
  }
  return null
}

export const readRef = (cfg, env = process.env) => (env.BOARD_SUPABASE_REF || cfg?.ref || '').trim() || null

// 반환: { ok, status, counts, message }. 자격·REF 가 없으면 NoCredential 을 던진다.
export async function sink(snap, { token, ref, fetchImpl = fetch }) {
  if (!token || !ref) throw new NoCredential('자격 없음 — 싣기 건너뜀')
  const query = toSql(snap)
  const res = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const counts = TABLES.map((t) => `${t} ${snap[t].length}`).join(' · ')
  let message = ''
  if (!res.ok) { try { const b = await res.json(); message = String(b?.message ?? b?.error ?? '').slice(0, 300) } catch { /* 본문 없음 */ } }
  return { ok: res.ok, status: res.status, counts, message }
}

// 직전 싣기 결과를 이 기기 로컬 파일에 남긴다(레포 밖) — 시각·결과·응답 코드(+실패 땐 응답 메시지 300자). 토큰·경로는 안 담는다. 쓰기 실패는 싣기를 깨지 않는다.
export function writeSinkState(path, rec) {
  if (!path) return
  try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(rec)) } catch { /* 상태 기록 실패는 무시 */ }
}

// 로그 한 줄 + 종료코드(0 성공 · 1 실패 · 3 자격 없음). 값은 찍지 않는다. opts.statePath 가 있으면 결과를 그 파일에 남긴다.
export async function sinkAndLog(snap, opts, log = console.log) {
  const { statePath, now = () => new Date(), ...sinkOpts } = opts
  const save = (result, status = null, message = '') => writeSinkState(statePath, { at: now().toISOString(), result, status, ...(message ? { message } : {}) }) // 실패 땐 응답 본문 요약(300자)도 남긴다
  try {
    const r = await sink(snap, sinkOpts)
    log(`싣기 응답 ${r.status} · ${r.counts}${r.message ? ` · ${r.message}` : ''}`)
    save(r.ok ? 'ok' : 'fail', r.status, r.ok ? '' : r.message)
    return r.ok ? 0 : 1
  } catch (e) {
    if (e instanceof NoCredential) { log(e.message); save('nocred'); return 3 }
    log(`싣기 실패: ${e instanceof Error ? e.message : 'fetch 오류'}`.slice(0, 300))
    save('fail')
    return 1
  }
}
