// Actions 안에서 돈다(가지 board-data): snapshot.json → SQL → Supabase Management API.
// 로그엔 응답 코드와 표별 줄 수만. 값(TOKEN·REF)은 찍지 않는다.
// publish.mjs 가 아래 import 줄을 to-sql.mjs 본문으로 갈아 끼워 자립 파일로 만든다.
// 스냅숏(BoardData 꼴) → board 표를 통째로 갈아 끼우는 SQL 한 덩이. 의존성 없음(apply.mjs 에 그대로 붙는다).
// 표 이름은 아래 고정 목록만 쓴다(입력 키에서 안 받는다). feedback 은 사람이 쓰는 표라 건드리지 않는다.
export const TABLES = ['actors', 'tasks', 'lanes', 'branches', 'services', 'modules', 'goals', 'events', 'usage', 'runs', 'sprints']

export function toSql(snap) {
  const parts = ['begin;']
  for (const t of TABLES) {
    const rows = snap?.[t]
    if (!Array.isArray(rows)) throw new Error(`스냅숏에 ${t} 배열이 없다`) // 빈 표로 지우는 사고 막기
    const json = JSON.stringify(rows)
    if (json.includes('$snap$')) throw new Error(`${t} 에 $snap$ 이 들어 있다`)
    parts.push(`delete from board.${t};`,
      `insert into board.${t} select * from jsonb_populate_recordset(null::board.${t}, $snap$${json}$snap$::jsonb);`)
  }
  parts.push('commit;')
  return parts.join('\n')
}
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
