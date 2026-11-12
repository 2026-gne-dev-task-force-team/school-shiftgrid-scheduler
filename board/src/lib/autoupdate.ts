import { isNewer, type VersionInfo } from './version.ts'

// 「새 판 오면 자동으로 바꾸기」 — 이 기기에 기억(우리 이름표 board. 가 붙은 칸 → 「저장소 비우기」가 같이 지운다). 기본 꺼짐.
export const AUTO_KEY = 'board.autoApply'
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const loadAuto = (s: KV): boolean => s.getItem(AUTO_KEY) === '1'
export const saveAuto = (s: KV, on: boolean): void => s.setItem(AUTO_KEY, on ? '1' : '0')

/** 글자를 치는 중인가 — 입력칸·글상자·선택칸·편집 가능 영역에 포커스. 체크박스·버튼은 글을 치는 자리가 아니라 제외. */
export function isTyping(el: Element | null | undefined): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes((el as HTMLInputElement).type)
  return (el as HTMLElement).isContentEditable === true
}

export interface AutoCtx { on: boolean; local: string; latest: VersionInfo | null; seen: string; typing: boolean }
/** 지금 저절로 바꿔도 되나. 같은 판은 seen(누른 판 기록)이 막아 두 번 바꾸지 않는다. 입력 중이면 미룬다(다음 확인 때 다시 묻는다). */
export const shouldAutoApply = (c: AutoCtx): boolean => c.on && isNewer(c.local, c.latest, c.seen) && !c.typing
