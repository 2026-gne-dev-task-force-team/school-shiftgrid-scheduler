import { h, isCalm } from '../dom.ts'
import type { LayerCtx, LayerRenderer } from '../layers/types.ts'

// 가운데 무대 — 층마다 렌더러만 다르다. 움직임은 여기서만.
export function createStage() {
  const el = h('main', { class: 'stage' })
  let cleanup: void | (() => void)
  let typing: ReturnType<typeof setInterval> | undefined
  return {
    el,
    show(r: LayerRenderer, ctx: LayerCtx) {
      if (cleanup) cleanup()
      clearInterval(typing)
      // 층이 host.replaceChildren 을 해도 부제가 안 지워지게 층은 안쪽 칸(display:contents)에 그린다.
      const host = h('div', { class: 'stage-host' })
      const desc = r.desc ? h('p', { class: 'tab-desc', 'aria-label': r.desc }, r.desc) : null
      el.replaceChildren(...(desc ? [desc] : []), host)
      // 대화창 타자 효과 — 0.6초 안에 끝(20틱), 움직임 끄기·시스템 줄이기면 즉시
      if (desc && r.desc && !isCalm() && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const full = r.desc, step = Math.ceil(full.length / 20)
        let n = 0
        desc.textContent = ''
        typing = setInterval(() => { n += step; desc.textContent = full.slice(0, n); if (n >= full.length) clearInterval(typing) }, 30)
      }
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
