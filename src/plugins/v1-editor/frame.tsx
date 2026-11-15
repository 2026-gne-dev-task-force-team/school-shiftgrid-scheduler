// v1 편성 판 — 같은 출처 iframe 한 장. 판 안 컴포넌트(P10 뒤 절반)가 이 틀을 쓴다.
import { useEffect, useRef } from 'react'
import { eventToKey, handleKeydown } from '../../pane-ui-system'

export const V1_EDITOR_SRC = './v1-editor.html'

/** iframe 이 키 이벤트를 쥐어 바깥 앱이 못 듣는 키 — 명령 팔레트(⌘K · 맥 Ctrl+K) 만 바깥 단축키 체계로 돌려보낸다. */
const PALETTE_KEYS = new Set(['Mod+K', 'Ctrl+K'])

/**
 * iframe 안 keydown 하나를 바깥으로 넘길지 정한다 — 넘겼으면 true.
 *   ⛔ Enter·방향키·글자·⌘Z 등 v1 앱 키는 건드리지 않는다. 한글 조합 중(isComposing·229)은 넘기지 않는다.
 *   Esc 는 v1 이 쓰므로 v1 이 먼저 처리(preventDefault)하지 않았을 때만, 바깥에 합성 keydown 으로 보내 떠 있는 층 줄이 받게 한다.
 */
export function forwardFrameKey(e: KeyboardEvent, outer: Window = window): boolean {
  if (e.isComposing || e.keyCode === 229) return false
  if (e.key === 'Escape') {
    if (e.defaultPrevented) return false
    outer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
    return true
  }
  const k = eventToKey(e)
  if (!k || !PALETTE_KEYS.has(k)) return false
  return handleKeydown(e)
}

/** 같은 출처 iframe 에 듣개를 붙인다 — 문서가 새로 로드될 때마다 다시 붙인다. */
export function attachFrameKeys(frame: HTMLIFrameElement): () => void {
  let off: (() => void) | null = null
  const bind = () => {
    off?.()
    off = null
    try {
      const win = frame.contentWindow
      if (!win) return
      const h = (e: KeyboardEvent) => { forwardFrameKey(e) }
      win.addEventListener('keydown', h)
      off = () => { try { win.removeEventListener('keydown', h) } catch { /* 창이 이미 닫힘 */ } }
    } catch { /* 다른 출처 — 접근 불가. postMessage 다리는 v1 쪽이 보내야 해 보고 대상 */ }
  }
  frame.addEventListener('load', bind)
  bind()
  return () => { frame.removeEventListener('load', bind); off?.() }
}

export function V1EditorFrame() {
  const ref = useRef<HTMLIFrameElement>(null)
  useEffect(() => (ref.current ? attachFrameKeys(ref.current) : undefined), [])
  return <iframe ref={ref} src={V1_EDITOR_SRC} title="시간표 편성" style={{ width: '100%', height: '100%', border: 0 }} />
}
