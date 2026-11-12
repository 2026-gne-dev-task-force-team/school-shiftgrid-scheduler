import { h } from '../dom.ts'
import type { Task } from '../types.ts'
import type { TaskDetailModel } from '../lib/task-detail.ts'

// 지라 이슈 화면 꼴: 왼쪽 본문(원래 요청 · 설명 · 완료 조건 · 이력) · 오른쪽 옆칸(유형 · 상태 · 캐릭터 · 가지 · 연결). 빈 칸은 만들지 않는다.
export function taskDetailView(m: TaskDetailModel, t: Task, extraSide: [string, string][], open: (id: string) => void): HTMLElement {
  const main = h('div', { class: 'td-main' }, h('code', { class: 'tid' }, t.id),
    ...m.main.map((s) => h('section', { class: 'td-sec' }, h('h4', null, s.label), h('p', { class: 'td-text' }, s.text))),
    ...(m.history.length ? [h('section', { class: 'td-sec' }, h('h4', null, '이력'), h('ol', { class: 'td-hist' }, ...m.history.map((e) => h('li', null, h('time', null, e.at), ` ${e.text}`))))] : []))
  const side = h('dl', { class: 'td-side' }, ...[...m.side, ...extraSide].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]),
    ...(m.links.length ? [h('dt', null, '연결된 태스크'), h('dd', { class: 'td-links' }, ...m.links.map((l) => { const b = h('button', { class: 'btn td-link', title: l.title }, `${l.id} ${l.title}`); b.addEventListener('click', () => open(l.id)); return b }))] : []))
  return h('div', { class: 'td' }, main, side)
}
