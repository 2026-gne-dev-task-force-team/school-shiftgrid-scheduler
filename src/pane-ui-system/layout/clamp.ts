/**
 * 폭 가두기 + 뷰 레이아웃 힌트 — 순수 계산. React·DOM·localStorage 0줄.
 *
 * 🔴 ⛔ 숫자 상수(150·520 …)를 여기 박지 않는다 — 기본값은 설정(pane-settings)에서 온다.
 *    이 파일은 「숫자를 어떻게 가두나」만 안다. 「기본 숫자가 몇인가」는 모른다.
 *    쥔님 2026-11-01: *"무한정 줄일 수 있게 하지 말고 … 바로 코드에 박지 말고 따로 설정할 수 있는 창구를."*
 *
 * ⭐ 뷰별 힌트(ViewLayout)는 "무슨 콘텐츠냐에 따라" 다르다 — 등록소가 기본을 주고, 설정이 덮는다.
 */

/** 좁아지려 할 때 뷰가 택하는 몸짓 */
export type Squeeze = 'shrink' | 'scroll' | 'collapse';

/** 한 뷰의 레이아웃 힌트 — 등록값이 기본, 설정이 덮는다 */
export interface ViewLayout {
    /** 이 아래로는 스플리터·사이드바 폭이 안 줄어든다(px) */
    minWidth?: number;
    minHeight?: number;
    /** 최소보다 좁아지려 하면: 내용을 찌그러뜨린다 / 스크롤 / 접는다 */
    squeeze?: Squeeze;
    /** squeeze='collapse' 일 때 이 폭 아래면 접힘(px) — 뷰가 collapsed props 로 받는다 */
    collapseBelow?: number;
}

/**
 * 한 칸의 유효 최소폭 — 설정 기본 최소폭과 그 칸 안 뷰가 요구하는 최소폭 중 큰 값.
 * ⭐ 「사이드바 최소 150」도 그 안 뷰 힌트가 더 크면 뷰 쪽이 이긴다.
 */
export function effectiveMin(settingMin: number, viewMin?: number): number {
    const a = Number.isFinite(settingMin) ? settingMin : 0;
    const b = typeof viewMin === 'number' && Number.isFinite(viewMin) ? viewMin : 0;
    return Math.max(a, b);
}

/**
 * 요청 폭을 [min, max] 안으로 반올림해 가둔다.
 * 🔴 하한이 이 함수의 핵심이다 — 하한이 빠지면 패널이 0 까지, 음수까지 줄어든다(쥔님 금지).
 *    min>max 로 들어와도 서로 바꿔 방어한다.
 */
export function clampWidthTo(requested: number, min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    if (!Number.isFinite(requested)) return lo;
    return Math.round(Math.max(lo, Math.min(hi, requested)));
}

/** squeeze='collapse' 이고 폭이 collapseBelow 아래면 「접힌 그림」으로 그린다 */
export function isCollapsed(layout: ViewLayout | undefined, width: number): boolean {
    if (!layout || layout.squeeze !== 'collapse') return false;
    if (typeof layout.collapseBelow !== 'number') return false;
    return width < layout.collapseBelow;
}

/** 두 레이아웃을 합친다 — 등록값(base) 위에 설정 덮어쓰기(over). undefined 는 아래 값을 지우지 않는다 */
export function mergeLayout(base: ViewLayout | undefined, over: Partial<ViewLayout> | undefined): ViewLayout {
    const out: ViewLayout = { ...(base ?? {}) };
    if (over) {
        if (over.minWidth !== undefined) out.minWidth = over.minWidth;
        if (over.minHeight !== undefined) out.minHeight = over.minHeight;
        if (over.squeeze !== undefined) out.squeeze = over.squeeze;
        if (over.collapseBelow !== undefined) out.collapseBelow = over.collapseBelow;
    }
    return out;
}

/**
 * 스플릿 손잡이를 끌 때 왼쪽 칸의 새 비율 — 두 이웃 칸이 px 최소폭 아래로 못 가게.
 *   pairFraction : 두 칸이 나눠 가진 비율의 합(이건 안 바뀐다)
 *   wantA        : 왼쪽 칸이 가지려는 비율(아직 안 가둠)
 *   total        : 두 칸이 걸친 전체 px (0 이하면 px 가둠을 건너뛴다)
 *   minApx/minBpx: 두 칸 안 활성 뷰의 최소 px
 *   minFrac      : 비율 하한(칸이 사라지지 않게)
 * 돌려주는 값 = 가둔 왼쪽 비율(오른쪽 = pairFraction − 이 값).
 */
export function clampSplitPair(
    pairFraction: number,
    wantA: number,
    total: number,
    minApx: number,
    minBpx: number,
    minFrac: number,
): number {
    const minAfrac = total > 0 ? Math.max(minFrac, minApx / total) : minFrac;
    const minBfrac = total > 0 ? Math.max(minFrac, minBpx / total) : minFrac;
    // 두 최소가 합보다 크면(둘 다 못 지킴) 반반으로 — 적어도 둘 다 살아 있게
    if (minAfrac + minBfrac >= pairFraction) return pairFraction / 2;
    const hiA = pairFraction - minBfrac;
    return Math.max(minAfrac, Math.min(hiA, wantA));
}
