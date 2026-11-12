import { h } from '../dom.ts'

export interface ChipOpts { icon: string | Node; label: string; hue?: number; id?: string; onClick?: () => void }

// 캐릭터·일감·가지·서비스는 어느 층에서나 이 모양(아이콘 + 짧은 이름). 색 = 캐릭터 hue.
export function chip(o: ChipOpts): HTMLElement {
  const el = h(o.onClick ? 'button' : 'span', { class: 'chip' }, h('span', { class: 'chip-i' }, o.icon), o.label)
  if (o.hue !== undefined) el.style.setProperty('--hue', String(o.hue))
  if (o.id) el.dataset.id = o.id
  if (o.onClick) el.addEventListener('click', o.onClick)
  return el
}

export const KIND_ICON: Record<string, string> = { work: '🔨', cr: '📐', bug: '🐞', decide: '🙋', review: '👀' }
export const DEPT_NAME: Record<string, string> = { hq: '본부', make: '제작부', qa: '품질부' }
export const STATE_ICON: Record<string, string> = { work: '🔨', idle: '⏸', blocked: '⛔', done: '✅' }
