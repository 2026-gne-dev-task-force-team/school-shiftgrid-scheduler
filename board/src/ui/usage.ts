import { h } from '../dom.ts'
import { etaMinutes, fmtDur } from '../lib/forecast.ts'
import type { Account, Usage } from '../types.ts'

const NAME: Record<Account, string> = { org: '기관 계정', personal: '개인 계정' }

function bar(label: string, pct: number, eta: number | null): HTMLElement {
  const fill = h('i')
  fill.style.width = `${Math.min(100, pct)}%`
  return h('div', { class: 'meter' },
    h('span', null, `${label} ${Math.round(pct)}%`), h('div', { class: 'bar' }, fill),
    h('small', null, eta === null ? '늘지 않는 중' : `이 속도면 ${fmtDur(eta)} 만에 다 쓴다`))
}

// 한도와 속도 — 계정 둘 나란히. 기울기는 계정별 마지막 두 줄(최근 구간)로 계산한다.
export function usagePanel(rows: Usage[]): HTMLElement {
  const wrap = h('div', { class: 'usage' })
  for (const acc of ['org', 'personal'] as const) {
    const r = rows.filter((u) => u.account === acc).sort((a, b) => a.ts.localeCompare(b.ts))
    const cur = r.at(-1), prev = r.at(-2)
    if (!cur) continue
    const dt = prev ? (Date.parse(cur.ts) - Date.parse(prev.ts)) / 60000 : 0
    const eta = (k: 'pct_5h' | 'pct_7d') => (prev && dt > 0 ? etaMinutes(cur[k], prev[k], dt) : null)
    const trend = !prev ? '' : cur.tok_per_min > prev.tok_per_min ? ' ↗ 빨라지는 중' : ' ↘ 느려지는 중'
    wrap.append(h('section', { class: 'card', 'data-acc': acc }, h('b', null, NAME[acc]),
      bar('5시간', cur.pct_5h, eta('pct_5h')), bar('7일', cur.pct_7d, eta('pct_7d')),
      h('small', null, `지금 분당 ${cur.tok_per_min.toLocaleString('ko-KR')} 토큰${trend}`)))
  }
  return wrap
}
