import { h } from '../dom.ts'
import type { DetailContent } from '../layers/types.ts'
import { DEFAULT_APP, type AppId } from '../lib/app.ts'
import { addFeedback, MAX_LEN } from '../lib/feedback.ts'

export const WHERE = ['막대', '1 한눈에', '2 갈래', '3 작업길', '4 일감판', '5 설계도', '한 바퀴', '접수함', '안내', '그 밖']

// 불편 접수 폼 — 기존 상세 칸(PC 옆 칸 · 폰 바텀시트)에 넣는다.
export function openFeedback(open: (c: DetailContent) => void, onDone: () => void, app: AppId = DEFAULT_APP): void {
  const text = h('input', { type: 'text', maxlength: String(MAX_LEN), 'aria-label': '불편한 점 한 줄' })
  const where = h('select', { 'aria-label': '어디서' }, ...WHERE.map((w) => h('option', null, w)))
  const msg = h('p', { role: 'alert' })
  const go = h('button', { class: 'btn' }, '접수')
  go.addEventListener('click', () => {
    const r = addFeedback(text.value, where.value, undefined, undefined, app)
    if (r.ok) onDone()
    else msg.textContent = r.reason
  })
  open({ title: '불편 접수', rows: [], extra: h('div', null, h('label', null, '불편한 점 한 줄', text), h('label', null, '어디서', where), go, msg) })
}
