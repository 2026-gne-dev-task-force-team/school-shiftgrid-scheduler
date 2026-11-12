import { h } from '../dom.ts'
import type { DetailContent } from '../layers/types.ts'

export type DetailLayout = 'side' | 'sheet'

// 오른쪽 상세 칸(블록 안). 폰(sheet)은 같은 컴포넌트가 바텀시트로 올라온다: 반쯤 → [↕] 전체 → ✕ 닫기.
export function createDetail() {
  const body = h('div', { class: 'detail-body' })
  const grow = h('button', { class: 'btn', 'aria-label': '크게 보기' }, '↕')
  const close = h('button', { class: 'btn', 'aria-label': '닫기' }, '✕')
  const el = h('aside', { class: 'detail', 'data-layout': 'side', hidden: '' }, h('div', { class: 'detail-head' }, grow, close), body)
  close.addEventListener('click', () => { el.hidden = true })
  grow.addEventListener('click', () => el.classList.toggle('full'))
  return {
    el,
    setLayout(l: DetailLayout) { el.dataset.layout = l },
    open(c: DetailContent) {
      body.replaceChildren(h('h3', null, c.title), ...c.rows.map(([k, v]) => h('p', null, h('b', null, `${k} `), v)))
      el.hidden = false
    },
  }
}
