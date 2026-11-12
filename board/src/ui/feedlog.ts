import { h } from '../dom.ts'
import type { BoardEvent } from '../types.ts'

// 왼쪽 흐름 로그. 줄을 누르면 onPick(subject_id) — 무대에서 그 물건이 반짝인다.
// 폰에서는 CSS 가 아래 서랍으로 바꾼다(최신 1줄만 보이고 ▲ 로 펼침).
export function createFeedLog(events: BoardEvent[], onPick: (id: string) => void): HTMLElement {
  const sorted = [...events].sort((a, b) => b.ts.localeCompare(a.ts))
  const toggle = h('button', { class: 'btn feed-toggle', 'aria-label': '로그 펼치기' }, '▲')
  const list = h('ol', { class: 'feed-list' })
  for (const e of sorted) {
    const b = h('button', { class: 'feed-line' }, e.text)
    b.addEventListener('click', () => onPick(e.subject_id))
    list.append(h('li', null, b))
  }
  const el = h('section', { class: 'feed' }, h('div', { class: 'feed-head' }, h('b', null, '흐름'), toggle), list)
  toggle.addEventListener('click', () => {
    const open = el.classList.toggle('open')
    toggle.textContent = open ? '▼' : '▲'
  })
  return el
}
