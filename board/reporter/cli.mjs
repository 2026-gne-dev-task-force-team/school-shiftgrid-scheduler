// node board/reporter/cli.mjs --tags-report  (읽기 전용: 태스크 분류표만 찍는다)
// node board/reporter/cli.mjs --out <파일> [--lane <노트>] [--requests <요청함 노트>] [--lane-root <레인 뿌리>] [--repo <폴더>] [--usage <json>] [--sink]
// 스냅숏 JSON 을 저장하고 표마다 줄 수만 찍는다(값은 안 찍는다). --sink 를 주면 이 기기에서 바로 Supabase 에 싣는다(git 안 씀).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from './snapshot.mjs'
import { tokensByToolUse, activityByGateId } from './tokens.mjs'
import { loadConfig } from './config.mjs'
import { tagsReport } from './tags.mjs'
import { audit, formatAudit } from './fill-audit.mjs'
import { readToken, readRef, sinkAndLog } from './sink.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const cfg = loadConfig()
const out = arg('--out')
const tagsOnly = process.argv.includes('--tags-report') // 읽기 전용 — 파일도 DB 도 안 건드리고 대상×유형 개수표만 찍는다
const auditOnly = process.argv.includes('--audit') // 읽기 전용 — 방금 뽑은 자료의 탭별 빈칸 수만 찍는다(파일·DB 안 건드림)
if (!out && !tagsOnly && !auditOnly) { console.error('쓰는 법: node board/reporter/cli.mjs --out <파일>'); process.exit(2) }
const dropped = {}
const data = build({
  lanePath: arg('--lane', cfg.lane),
  requestPath: arg('--requests', cfg.requests),
  laneRoot: arg('--lane-root', cfg.laneRoot),
  repoDir: arg('--repo', fileURLToPath(new URL('../..', import.meta.url))),
  usagePath: arg('--usage', cfg.usage),
  gatePath: arg('--gate', cfg.gate),
  tokens: tokensByToolUse(arg('--projects', cfg.projects)),
  activity: activityByGateId(arg('--projects', cfg.projects)),
  redactNames: cfg.redactNames,
  onWarn: (dir, why) => console.warn('경고', dir, why),
  onInfo: (dir, why) => console.log('정보', dir, why),
  onDrop: (table) => { dropped[table] = (dropped[table] ?? 0) + 1 },
})
if (tagsOnly) { console.log(tagsReport(data.tasks)); process.exit(0) }
if (auditOnly) { console.log(formatAudit(audit(data))); if (!out) process.exit(0) }
writeFileSync(out, JSON.stringify(data, null, 2))
for (const [k, v] of Object.entries(data)) console.log(`${k}\t${v.length}`)
console.log('담백 검사로 버린 줄', JSON.stringify(dropped))
if (process.argv.includes('--sink')) process.exit(await sinkAndLog(data, { token: readToken(), ref: readRef(cfg), statePath: cfg.sinkState }))
