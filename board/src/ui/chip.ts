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
export const STATE_ICON: Record<string, string> = { work: '🔨', idle: '💤', wait: '⏳', blocked: '⛔', off: '🏠', done: '🏠' }
export const STATE_NAME: Record<string, string> = { work: '일함', idle: '쉼', wait: '대기', blocked: '막힘', off: '퇴근', done: '퇴근' }
/** 퇴근(옛 done 포함) 인가 — 숙소에 모이고 흐리게 그린다. */
export const isOff = (s: string): boolean => s === 'off' || s === 'done'
