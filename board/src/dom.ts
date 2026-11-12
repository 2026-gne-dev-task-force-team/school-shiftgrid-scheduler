type Kid = Node | string | null | false
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> | null = null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, v)
  for (const k of kids) if (k !== null && k !== false) el.append(k)
  return el
}

// 움직임 끄기는 문서 전체가 아니라 현황판 루트(.sgb)에만 건다.
export const sgbRoot = (): HTMLElement | null => document.querySelector<HTMLElement>('.sgb')
export const isCalm = (): boolean => !!sgbRoot()?.classList.contains('calm')
