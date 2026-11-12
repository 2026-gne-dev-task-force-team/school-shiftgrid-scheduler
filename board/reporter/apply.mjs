// Actions 안에서 돈다(가지 board-data): snapshot.json → SQL → Supabase Management API.
// 로그엔 응답 코드와 표별 줄 수만. 값(TOKEN·REF)은 찍지 않는다.
// publish.mjs 가 아래 import 줄을 to-sql.mjs 본문으로 갈아 끼워 자립 파일로 만든다.
import { toSql, TABLES } from './to-sql.mjs'
import { readFileSync } from 'node:fs'

const { REF, TOKEN } = process.env
if (!REF || !TOKEN) { console.log('::error title=현황판 자료::REF 또는 TOKEN 없음'); process.exit(1) }
const snap = JSON.parse(readFileSync(new URL('./snapshot.json', import.meta.url), 'utf-8'))
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: toSql(snap) }),
})
const counts = TABLES.map((t) => `${t} ${snap[t].length}`).join(' · ')
let msg = ''
if (!res.ok) { try { const b = await res.json(); msg = String(b?.message ?? b?.error ?? '').slice(0, 300) } catch { /* 본문 없음 */ } }
console.log(`::notice title=현황판 자료::응답 ${res.status} · ${counts}${msg ? ` · ${msg}` : ''}`)
if (!res.ok) process.exit(1)
