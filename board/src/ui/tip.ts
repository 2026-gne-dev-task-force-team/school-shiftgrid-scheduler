import { h } from '../dom.ts'

let box: HTMLElement | null = null
const show = (text: string, x: number, y: number) => {
  box ??= document.body.appendChild(h('div', { class: 'tip', role: 'tooltip' }))
  box.textContent = text
  box.style.left = `${Math.min(x + 12, innerWidth - 180)}px`
  box.style.top = `${y + 16}px`
  box.hidden = false
}
const hide = () => { if (box) box.hidden = true }

// PC: 마우스 올리기 · 폰: 길게 누르기 500ms. 툴팁만 블록 경계를 넘을 수 있다(body 에 붙는다).
export function attachTip(el: HTMLElement, text: () => string): void {
  let timer = 0
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(text(), e.clientX, e.clientY) })
  el.addEventListener('pointerleave', hide)
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return
    timer = window.setTimeout(() => show(text(), e.clientX, e.clientY - 60), 500)
  })
  const end = () => { clearTimeout(timer); setTimeout(hide, 1500) }
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)
}
