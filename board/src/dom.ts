type Kid = Node | string | null | false
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> | null = null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, v)
  for (const k of kids) if (k !== null && k !== false) el.append(k)
  return el
}
