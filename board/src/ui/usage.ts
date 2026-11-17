import { h } from '../dom.ts'
import { etaMinutes, fmtDur } from '../lib/forecast.ts'
import { fmtReset } from '../lib/ko.ts'
import type { Account, Usage } from '../types.ts'

const NAME: Record<Account, string> = { org: '기관 계정', personal: '개인 계정' }

/** 한도 막대 한 줄. 100% 에 닿으면 「초과」— 막대가 꽉 차고 붉어지며, 풀리는 시각을 적는다(쥔님 11-17 *"한도바도 초과됐다고 표현"*). */
export function bar(label: string, pct: number, eta: number | null, resetAt: string | null = null, now = Date.now()): HTMLElement {
  const fill = h('i')
  fill.style.width = `${Math.min(100, pct)}%`
  const over = pct >= 100
  const when = fmtReset(resetAt, now)
  return h('div', { class: `meter${over ? ' over' : ''}` },
    h('span', null, `${label} ${Math.round(pct)}%${over ? ' · 초과' : ''}`), h('div', { class: 'bar' }, fill),
    h('small', null, over ? `한도에 막힘${when ? ` · 풀림 ${when}` : ''}` : eta === null ? '늘지 않는 중' : `이 속도면 ${fmtDur(eta)} 만에 다 쓴다`))
}

/** 토큰 속도 줄 — 한도 파일엔 토큰이 없어 tok_per_min 이 0 으로 온다. 0 이면 줄을 감추고(「분당 0」은 거짓), 두 줄 다 값이 있을 때만 추세를 붙인다. */
export function speedLine(cur: Usage, prev?: Usage): string {
  if (!(cur.tok_per_min > 0)) return ''
  const trend = !prev || !(prev.tok_per_min > 0) || prev.tok_per_min === cur.tok_per_min ? '' : cur.tok_per_min > prev.tok_per_min ? ' ↗ 빨라지는 중' : ' ↘ 느려지는 중'
  return `지금 분당 ${cur.tok_per_min.toLocaleString('ko-KR')} 토큰${trend}`
}

// 한도와 속도 — 한 줄을 반으로 갈라 왼쪽 기관 · 오른쪽 개인. 값 없는 쪽은 「기록 없음」 자리만. 기울기는 계정별 마지막 두 줄(최근 구간)로 계산한다.
export function usagePanel(rows: Usage[]): HTMLElement {
  const wrap = h('div', { class: 'usage' })
  for (const acc of ['org', 'personal'] as const) {
    const r = rows.filter((u) => u.account === acc).sort((a, b) => a.ts.localeCompare(b.ts))
    const cur = r.at(-1), prev = r.at(-2)
    if (!cur) { wrap.append(h('section', { class: 'half empty', 'data-acc': acc }, h('b', null, NAME[acc]), h('small', null, '기록 없음'))); continue }
    const dt = prev ? (Date.parse(cur.ts) - Date.parse(prev.ts)) / 60000 : 0
    const eta = (k: 'pct_5h' | 'pct_7d') => (prev && dt > 0 ? etaMinutes(cur[k], prev[k], dt) : null)
    const sp = speedLine(cur, prev)
    wrap.append(h('section', { class: 'half', 'data-acc': acc }, h('b', null, NAME[acc]),
      bar('5시간', cur.pct_5h, eta('pct_5h'), cur.reset_5h_at), bar('7일', cur.pct_7d, eta('pct_7d'), cur.reset_7d_at), ...(sp ? [h('small', null, sp)] : [])))
  }
  return wrap
}
