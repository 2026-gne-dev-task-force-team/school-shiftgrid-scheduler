/**
 * 합계 바(quick-calc) — 고른 칸 글자들에서 숫자만 골라 합·평균·최소·최대·개수를 낸다(넘버스 하단 바).
 *   숫자로 안 읽히는 칸·빈 칸은 숫자 집계에서 빠지고, count 는 「비지 않은 칸」 수다.
 */
export interface QuickCalc { sum: number; avg: number; min: number; max: number; nums: number; count: number }

/** '1,234' · '12.5%' · ' -3 ' 를 숫자로. 못 읽으면 null. */
export function toNumber(text: string): number | null {
    const t = text.trim().replace(/,/g, '');
    if (!t) return null;
    const pct = t.endsWith('%');
    const n = Number(pct ? t.slice(0, -1) : t);
    if (!Number.isFinite(n)) return null;
    return pct ? n / 100 : n;
}

export function quickCalc(texts: string[]): QuickCalc | null {
    let sum = 0, min = Infinity, max = -Infinity, nums = 0, count = 0;
    for (const t of texts) {
        if (t.trim()) count++;
        const n = toNumber(t);
        if (n == null) continue;
        nums++; sum += n;
        if (n < min) min = n;
        if (n > max) max = n;
    }
    if (!nums) return count ? { sum: 0, avg: 0, min: 0, max: 0, nums: 0, count } : null;
    return { sum, avg: sum / nums, min, max, nums, count };
}

/** 하단 바 숫자 표기 — 소수 넷째 자리까지, 천 단위 쉼표(한국어). */
export function fmtNum(n: number): string {
    return n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
}
