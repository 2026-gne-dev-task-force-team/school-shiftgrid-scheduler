import { h } from '../dom.ts'
import type { LayerRenderer } from './types.ts'

// 층 2~5 자리표 — 각 층 판이 자기 렌더러에서 이 호출을 지우고 채운다.
export function placeholder(floor: 2 | 3 | 4 | 5, tab: string, title: string): LayerRenderer {
  return {
    id: `layer${floor}`, floor, tab,
    render(host) {
      host.append(h('div', { class: 'ph' }, h('strong', null, `${title}`), h('p', null, '준비 중')))
    },
  }
}
