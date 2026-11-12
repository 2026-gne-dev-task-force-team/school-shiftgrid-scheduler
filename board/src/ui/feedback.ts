import { h } from '../dom.ts'
import type { DetailContent } from '../layers/types.ts'
import { addFeedback, MAX_LEN } from '../lib/feedback.ts'

export const WHERE = ['띠', '1 한눈', '2 가지', '3 길', '4 작업장', '5 설계도', '안내', '그 밖']

// 불편 접수 폼 — 기존 상세 칸(PC 옆 칸 · 폰 바텀시트)에 넣는다.
export function openFeedback(open: (c: DetailContent) => void, onDone: () => void): void {
  const text = h('input', { type: 'text', maxlength: String(MAX_LEN), 'aria-label': '불편한 점 한 줄' })
  const where = h('select', { 'aria-label': '어디서' }, ...WHERE.map((w) => h('option', null, w)))
  const msg = h('p', { role: 'status' })
  const go = h('button', { class: 'btn' }, '접수')
  go.addEventListener('click', () => {
    const r = addFeedback(text.value, where.value)
    if (r.ok) onDone()
    else msg.textContent = r.reason
  })
  open({ title: '불편 접수', rows: [], extra: h('div', null, text, where, go, msg) })
}
