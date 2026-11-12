import { h } from '../dom.ts'
import type { Task } from '../types.ts'
import { KIND_LABEL } from '../lib/task-detail.ts'

// 카드 작은 색 칩 둘(R73) — 대상(target) · 유형(kind). 색은 글자 하나에만 기대지 않게 글도 같이 쓴다.
export const TARGET_HUE: Record<string, number> = { 현황판: 200, '1.2v 앱': 150, v1: 30, v2: 280, 장치: 50, 검수: 340, 미분류: 0 }
export const KIND_HUE: Record<Task['kind'], number> = { work: 210, cr: 270, bug: 5, decide: 45, review: 330 }

export interface TagChip { cls: 'tag-target' | 'tag-kind'; text: string; hue: number; muted: boolean }
/** 카드에 그릴 칩 설명 — target 이 없는 옛 자료는 대상 칩을 건너뛴다(유형 칩만). */
export function tagChipSpecs(t: Pick<Task, 'kind' | 'target'>): TagChip[] {
  const out: TagChip[] = []
  if (t.target) out.push({ cls: 'tag-target', text: t.target, hue: TARGET_HUE[t.target] ?? 0, muted: t.target === '미분류' || !(t.target in TARGET_HUE) })
  out.push({ cls: 'tag-kind', text: (KIND_LABEL[t.kind] ?? t.kind).replace(/^\S+\s/, ''), hue: KIND_HUE[t.kind] ?? 0, muted: false })
  return out
}
export function tagChips(t: Pick<Task, 'kind' | 'target'>): HTMLElement[] {
  return tagChipSpecs(t).map((c) => h('span', { class: `tag ${c.cls}${c.muted ? ' muted' : ''}`, style: `--hue:${c.hue}` }, c.text))
}
