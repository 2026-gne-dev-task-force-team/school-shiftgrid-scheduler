import { h } from '../dom.ts'
import { hideFeedback, loadFeedback, loadHidden, mergeInbox, notifyFeedbackChanged, removeFeedback, setStatus, STATUSES, STATUS_NAME, type Status } from '../lib/feedback.ts'
import type { LayerRenderer } from './types.ts'

const fmt = (ts: string) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

// 접수함 — 이 기기 접수(localStorage) + 서버 접수를 한 목록으로. 상태 바꾸기·지우기는 이 기기 접수만.
export const inbox: LayerRenderer = {
  id: 'inbox', floor: 6, tab: 'Inbox',
  render(host, { data }) {
    const draw = () => {
      const items = mergeInbox(loadFeedback(), (data.serverFeedback ?? []).filter((f) => !loadHidden().includes(f.id)))
      if (!items.length) { host.replaceChildren(h('p', { class: 'card' }, '아직 접수된 불편이 없습니다 — 위 [불편 접수] 로 한 줄 남기면 여기 쌓입니다')); return }
      host.replaceChildren(...items.map((f) => {
        const row = h('section', { class: 'card', 'data-id': f.id }, h('b', null, f.text),
          h('small', null, `${f.where || '—'} · ${fmt(f.ts)}`), h('span', { class: 'chip' }, f.origin === 'local' ? '이 기기' : '서버'))
        if (f.origin === 'server') {
          const hide = h('button', { class: 'btn' }, '숨기기') // 서버 사본은 못 지운다 — 이 기기 화면에서만 가린다
          hide.addEventListener('click', () => { hideFeedback(f.id); notifyFeedbackChanged(); draw() })
          row.append(h('span', { class: 'chip' }, STATUS_NAME[f.status]), hide)
          return row
        }
        const sel = h('select', { 'aria-label': '상태' }, ...STATUSES.map((s) => h('option', { value: s }, STATUS_NAME[s])))
        sel.value = f.status
        sel.addEventListener('change', () => { setStatus(f.id, sel.value as Status); notifyFeedbackChanged(); draw() })
        const del = h('button', { class: 'btn' }, '지우기')
        let armed = false
        del.addEventListener('click', () => {
          if (!armed) { armed = true; del.textContent = '정말 지우기'; return }
          removeFeedback(f.id); notifyFeedbackChanged(); draw()
        })
        row.append(sel, del)
        return row
      }))
    }
    draw()
  },
}
