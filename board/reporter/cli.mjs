// node board/reporter/cli.mjs --out <파일> [--lane <노트>] [--requests <요청함 노트>] [--lane-root <레인 뿌리>] [--repo <폴더>] [--usage <json>]
// 스냅숏 JSON 을 저장하고 표마다 줄 수만 찍는다(값은 안 찍는다).
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from './snapshot.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const out = arg('--out')
if (!out) { console.error('쓰는 법: node board/reporter/cli.mjs --out <파일>'); process.exit(2) }
const dropped = {}
const data = build({
  lanePath: arg('--lane', 'D:/문서/subnauticaz/계획/판/시간표 작업판/레인/작업현황판/레인 작업현황판.md'),
  requestPath: arg('--requests', 'D:/문서/subnauticaz/계획/판/시간표 작업판/레인/요청함/레인 요청함.md'),
  laneRoot: arg('--lane-root', 'D:/문서/subnauticaz/계획/판/시간표 작업판/레인'),
  repoDir: arg('--repo', fileURLToPath(new URL('../..', import.meta.url))),
  usagePath: arg('--usage', join(homedir(), '.claude', 'rate-limits.json')),
  gatePath: arg('--gate', join(homedir(), '.claude', 'board', 'actors.json')),
  onWarn: (dir, why) => console.warn('경고', dir, why),
  onDrop: (table) => { dropped[table] = (dropped[table] ?? 0) + 1 },
})
writeFileSync(out, JSON.stringify(data, null, 2))
for (const [k, v] of Object.entries(data)) console.log(`${k}\t${v.length}`)
console.log('담백 검사로 버린 줄', JSON.stringify(dropped))
