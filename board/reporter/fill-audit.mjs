// 현황판 탭별 빈칸 세기 — 스냅숏(BoardData) 한 벌을 받아 「탭 · 칸 · 빈 수/전체」를 센다. 읽기 전용.
// node board/reporter/fill-audit.mjs <스냅숏.json>   (또는 cli.mjs --audit 가 방금 뽑은 자료로 같은 표를 찍는다)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const blank = (v) => v == null || v === '' || (Array.isArray(v) && !v.length)
const GENERIC_BRANCH = /^가지 \S+$/ // 이름만 있는 가지 — 설명이 없다
const live = (a) => a.state !== 'off' && a.state !== 'done'

/** 탭 → [칸 이름, 대상 줄 걸러내기, 빈 판정]. 탭 이름은 src/layers/registry.ts 의 층 id 순서. */
export const RULES = [
  ['1층 한눈', '맡은 일', (d) => d.actors.filter(live), (a) => blank(a.task_id)],
  ['1층 한눈', '쓴 토큰', (d) => d.actors.filter(live), (a) => blank(a.tok_total)],
  ['2층 가지', '가지 설명(이름뿐)', (d) => d.branches.filter((b) => !b.trunk), (b) => GENERIC_BRANCH.test(b.title)],
  ['2층 가지', '열린 가지의 담당', (d) => d.branches.filter((b) => !b.trunk && b.state === 'live'), (b) => blank(b.actor_id)],
  ['3층 길', '길 담당', (d) => d.lanes, (l) => blank(l.actor_id)],
  ['4층 일감', '설명', (d) => d.tasks, (t) => blank(t.body)],
  ['4층 일감', '이력', (d) => d.tasks, (t) => blank(t.history)],
  ['4층 일감', '일하는 이(일하는 칸만)', (d) => d.tasks.filter((t) => t.column === 'work'), (t) => blank(t.actor_id)],
  ['5층 설계도', '연결된 일감', (d) => d.modules, (m) => blank(m.task_id)],
  ['5층 설계도', '메모', (d) => d.modules, (m) => blank(m.note)],
  ['스프린트', '검수·QA', (d) => d.sprints, (s) => blank(s.review)],
  ['스프린트', '다음엔(이어지는 스프린트가 있을 때)', (d) => d.sprints.slice(0, -1), (s) => blank(s.next)],
]

/** 스냅숏 → [{ tab, cell, empty, total }]. 받은 접수함·안내 탭은 스냅숏 밖(서버·정적 글)이라 세지 않는다. */
export function audit(data) {
  return RULES.map(([tab, cell, pick, isBlank]) => {
    const rows = pick(data)
    return { tab, cell, empty: rows.filter(isBlank).length, total: rows.length }
  })
}

export function formatAudit(rows) {
  return rows.map((r) => `${r.tab}\t${r.cell}\t${r.empty}/${r.total}`).join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = process.argv[2]
  if (!f) { console.error('쓰는 법: node board/reporter/fill-audit.mjs <스냅숏.json>'); process.exit(2) }
  console.log(formatAudit(audit(JSON.parse(readFileSync(f, 'utf-8')))))
}
