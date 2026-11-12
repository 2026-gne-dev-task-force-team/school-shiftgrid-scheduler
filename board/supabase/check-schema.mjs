// board-schema.sql 을 PGlite(진짜 Postgres WASM)에 두 번 돌려 보고(멱등), 거절·허용 사례를 잰다.
// 돌리기: 레포 밖 빈 폴더에서 `npm i @electric-sql/pglite` 후 `node <이 파일> <board-schema.sql 경로>` (레포 의존성엔 안 넣는다).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const sql = readFileSync(process.argv[2], 'utf-8')
const db = new PGlite()
// Supabase 가 미리 깔아 두는 것 흉내: 역할 둘 + realtime publication
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create publication supabase_realtime;`)
await db.exec(sql)
await db.exec(sql) // 멱등
let bad = 0
const ok = async (label, q, expectOk) => {
  try { await db.exec(q); if (!expectOk) { bad++; console.log('❌ 통과하면 안 됨:', label) } else console.log('✅', label) }
  catch (e) { if (expectOk) { bad++; console.log('❌ 막히면 안 됨:', label, '—', e.message) } else console.log('✅ 막힘:', label) }
}
await ok('feedback 3/4교시', `insert into board.feedback(text, place) values ('3/4교시 칸이 좁아요','막대')`, true)
await ok('feedback 빈 칸', `insert into board.feedback(text) values ('   ')`, false)
await ok('feedback 201자', `insert into board.feedback(text) values (repeat('가',201))`, false)
await ok('feedback 이메일', `insert into board.feedback(text) values ('a@b.kr 로 연락')`, false)
await ok('feedback 비밀 꼴', `insert into board.feedback(text) values ('키 sk-abc')`, false)
await ok('tasks 제목 task-board', `insert into board.tasks(id,title,category,kind,team,lane_id,"column",reason) values ('t1','task-board 정리','코드','work','제작','l1','wait','new')`, true)
await ok('tasks 제목 경로', `insert into board.tasks(id,title,category,kind,team,lane_id,"column",reason) values ('t2','D:\\x 고침','코드','work','제작','l1','wait','new')`, false)
await ok('tasks block_kind 엉뚱', `insert into board.tasks(id,title,category,kind,team,lane_id,"column",reason,block_kind) values ('t3','가','코드','work','제작','l1','wait','new','zzz')`, false)
await ok('sprints 정상', `insert into board.sprints(id,title,goal,began,task_ids) values (1,'뼈대','목표','2026-11-12T10:55:00+09:00','{T-1a}')`, true)
await ok('sprints 경로 글', `insert into board.sprints(id,title,began) values (2,'D:\\x 고침','2026-11-12T10:55:00+09:00')`, false)
// 권한: anon 은 읽기만, authenticated 는 feedback text·place 만 insert
await ok('anon select tasks', `set role anon; select * from board.tasks; reset role;`, true)
await db.exec('reset role')
await ok('anon insert feedback', `set role anon; insert into board.feedback(text) values ('익명');`, false)
await db.exec('reset role')
await ok('authenticated insert feedback', `set role authenticated; insert into board.feedback(text, place) values ('로그인 접수','한눈');`, true)
await db.exec('reset role')
await ok('authenticated insert tasks', `set role authenticated; insert into board.tasks(id,title,category,kind,team,lane_id,"column",reason) values ('t9','가','코드','work','제작','l1','wait','new');`, false)
await ok('anon select sprints', `set role anon; select * from board.sprints; reset role;`, true)
await db.exec('reset role')
const pub = await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1`)
console.log('realtime:', pub.rows.map((r) => r.tablename).join(','))
const n = await db.query(`select count(*)::int n from information_schema.tables where table_schema='board'`)
console.log('표 수:', n.rows[0].n, '· 실패', bad)
process.exit(bad ? 1 : 0)
