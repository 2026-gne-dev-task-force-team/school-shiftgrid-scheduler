import { h } from '../dom.ts'
import type { LayerCtx, LayerRenderer } from '../layers/types.ts'

// 가운데 무대 — 층마다 렌더러만 다르다. 움직임은 여기서만.
export function createStage() {
  const el = h('main', { class: 'stage' })
  let cleanup: void | (() => void)
  return {
    el,
    show(r: LayerRenderer, ctx: LayerCtx) {
      if (cleanup) cleanup()
      el.replaceChildren()
      el.dataset.layer = r.id
      cleanup = r.render(el, ctx)
    },
    pulse(id: string) {
      el.querySelectorAll<HTMLElement>('[data-id]').forEach((n) => {
        if (n.dataset.id !== id) return
        n.classList.add('pulse')
        setTimeout(() => n.classList.remove('pulse'), 1200)
      })
    },
  }
}
