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
      // 층이 host.replaceChildren 을 해도 부제가 안 지워지게 층은 안쪽 칸(display:contents)에 그린다.
      const host = h('div', { class: 'stage-host' })
      el.replaceChildren(...(r.desc ? [h('p', { class: 'tab-desc' }, r.desc)] : []), host)
      el.dataset.layer = r.id
      cleanup = r.render(host, ctx)
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
