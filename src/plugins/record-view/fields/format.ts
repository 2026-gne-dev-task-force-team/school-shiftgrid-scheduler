/**
 * 숫자 서식 — 저장값은 안 바꾸고 「보이는 글자」만 만든다(순수). 셀 표시에서만 쓰고 toText(정렬·검색·복사)는 날값 그대로.
 *   plain 그대로 · comma 천 단위 · percent ×100+% · won 천 단위+원. decimals 를 주면 그 자릿수로.
 */
export interface NumberFormat {
    format?: 'plain' | 'comma' | 'percent' | 'won';
    decimals?: number;
}

/** 정수부에 천 단위 쉼표(소수부·부호는 그대로) */
function group(s: string): string {
    const neg = s.startsWith('-');
    const body = neg ? s.slice(1) : s;
    const [int, frac] = body.split('.');
    const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + withCommas + (frac !== undefined ? `.${frac}` : '');
}

export function formatNumber(value: unknown, config?: unknown): string {
    if (typeof value !== 'number' || Number.isNaN(value)) return '';
    const c = (config && typeof config === 'object' ? config : {}) as NumberFormat;
    const fmt = c.format ?? 'plain';
    const base = fmt === 'percent' ? value * 100 : value;
    let s = typeof c.decimals === 'number' && c.decimals >= 0 ? base.toFixed(c.decimals) : String(base);
    if (fmt === 'comma' || fmt === 'won' || fmt === 'percent') s = group(s);
    if (fmt === 'percent') return `${s}%`;
    if (fmt === 'won') return `${s}원`;
    return s;
}
