/**
 * W-X 세로로 「실제로 보이는 띠」 — 표 상자 자신이 아니라 세로로 스크롤되는 가장 가까운 조상(없으면 창)을 찾는다.
 *   🔴 표 상자(containerRef)는 가로만 스크롤된다 — 세로는 바깥 틀(Frame scroll)이 굴러서 box.clientHeight = 표 전체 높이였다
 *      (V-W 6b: ↓30번에 활성칸이 화면 밖 · PageDown 이 한 번에 끝으로).
 *   돌려주는 top·bottom 은 화면 좌표(창 밖으로 나간 부분은 깎는다). scroller 가 null 이면 창이 굴러간다.
 */
export function verticalViewport(el: HTMLElement): { scroller: HTMLElement | null; top: number; bottom: number } {
    const winH = typeof window !== 'undefined' ? window.innerHeight : 0;
    for (let p: HTMLElement | null = el; p; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) {
            const r = p.getBoundingClientRect();
            const top = Math.max(r.top + p.clientTop, 0);
            const bottom = Math.min(r.top + p.clientTop + p.clientHeight, winH || Infinity);
            return { scroller: p, top, bottom };
        }
    }
    return { scroller: null, top: 0, bottom: winH };
}
