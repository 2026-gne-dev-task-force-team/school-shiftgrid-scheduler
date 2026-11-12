// to-sql 결과를 PGlite(진짜 Postgres WASM)에 넣어 표별 줄 수가 스냅숏과 같은지 · 두 번 넣어도 같은지(멱등) 잰다.
// 돌리기: 레포 밖 빈 폴더에서 `npm i @electric-sql/pglite` 후
//   node board/reporter/check-sql.mjs <그 폴더> [스냅숏 json]   (레포 의존성엔 안 넣는다)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { TABLES, toSql } from './to-sql.mjs'

const [pgDir, snapPath = 'D:/gne-dev-task/sg-qa/snapshot.json'] = process.argv.slice(2)
if (!pgDir) { console.error('쓰는 법: node check-sql.mjs <pglite 깐 폴더> [스냅숏]'); process.exit(2) }
const { PGlite } = await import(pathToFileURL(join(pgDir, 'node_modules/@electric-sql/pglite/dist/index.js')).href)

const snap = JSON.parse(readFileSync(snapPath, 'utf-8'))
const schema = readFileSync(new URL('../supabase/board-schema.sql', import.meta.url), 'utf-8')
const db = new PGlite()
// Supabase 가 미리 깔아 두는 것 흉내(check-schema.mjs 와 같다)
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create publication supabase_realtime;`)
await db.exec(schema)
await db.exec(`insert into board.feedback(text) values ('남아야 할 접수')`) // feedback 은 안 건드려야 한다

const counts = async () => Object.fromEntries(await Promise.all([...TABLES, 'feedback'].map(async (t) =>
  [t, (await db.query(`select count(*)::int n from board.${t}`)).rows[0].n])))
const dump = async () => JSON.stringify(await Promise.all(TABLES.map(async (t) => (await db.query(`select * from board.${t} order by 1, 2`)).rows)))

const sql = toSql(snap)
await db.exec(sql)
const c1 = await counts(); const d1 = await dump()
await db.exec(sql)
const c2 = await counts(); const d2 = await dump()

let bad = 0
for (const t of TABLES) {
  const ok = c1[t] === snap[t].length && c2[t] === c1[t]
  if (!ok) bad++
  console.log(`${ok ? '✅' : '❌'} ${t}\t스냅숏 ${snap[t].length}\t1회 ${c1[t]}\t2회 ${c2[t]}`)
}
if (c2.feedback !== 1) { bad++; console.log('❌ feedback 이 바뀜', c2.feedback) } else console.log('✅ feedback 그대로 1')
if (d1 !== d2) { bad++; console.log('❌ 두 번째 내용이 다름') } else console.log('✅ 멱등(두 번 넣은 내용 같음)')
console.log('SQL 길이', sql.length, '· 실패', bad)
process.exit(bad ? 1 : 0)
