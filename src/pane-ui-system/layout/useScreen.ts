/**
 * 화면 사정 — 「좁은 화면인가」와 패널 상태(폭·접힘·세로 분할)를 한 자리에서 쥔다.
 * ⚠️ 창 폭을 render 중에 읽지 않는다(매 프레임 다시 그린다) — matchMedia 구독으로 바뀔 때만 깨운다.
 *
 * (출처: 옛 v2 `src/v2/ui/useScreen.ts` — leftSplit 조절을 더했다.)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    NARROW_PX, loadPanels, openOne, savePanels, type PanelState,
} from './panels';

/** 폭이 NARROW_PX 아래면 「좁은 화면」 — 붙박이 패널 대신 덮는 서랍으로 간다 */
export function useNarrow(): boolean {
    const [narrow, setNarrow] = useState(() =>
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia(`(max-width: ${NARROW_PX - 1}px)`).matches
            : false,
    );
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia(`(max-width: ${NARROW_PX - 1}px)`);
        const h = (e: MediaQueryListEvent) => setNarrow(e.matches);
        mq.addEventListener('change', h);
        setNarrow(mq.matches);
        return () => mq.removeEventListener('change', h);
    }, []);
    return narrow;
}

export interface Panels {
    state: PanelState;
    setWidth: (side: 'left' | 'right', w: number) => void;
    toggle: (side: 'left' | 'right', open: boolean) => void;
    /** 고정(📌) 토글 — 풀면 덮는 서랍, 걸면 붙박이 */
    setPinned: (side: 'left' | 'right', pinned: boolean) => void;
}

/**
 * 패널 폭·접힘·세로 분할 — 기기별 localStorage 에 보관한다.
 * 좁은 화면으로 들어오면 두 서랍을 닫는다(안 닫으면 켜자마자 화면을 덮는다).
 * 🔴 그 자동 닫기는 보관하지 않는다 — 넓은 화면으로 돌아갔을 때 접힌 채로 남으면 「고장난 것처럼」 보인다.
 */
export function usePanels(narrow: boolean): Panels {
    // 넓은 화면에서의 열림 상태를 따로 기억한다 — 좁은 화면의 자동 닫기가 이 값을 안 건드린다
    const wideOpen = useRef<{ left: boolean; right: boolean }>({ left: true, right: true });
    // 켤 때 이미 좁은 화면이면 서랍은 닫힌 채로 시작한다 — 켜자마자 화면이 덮이면 안 된다
    const [state, setState] = useState<PanelState>(() => {
        const p = loadPanels();
        wideOpen.current = { left: p.leftOpen, right: p.rightOpen };
        return narrow ? { ...p, leftOpen: false, rightOpen: false } : p;
    });
    const wasNarrow = useRef(narrow);

    // 넓은 화면 ↔ 좁은 화면을 오갈 때의 열림 상태 갈아끼우기
    useEffect(() => {
        if (narrow === wasNarrow.current) return;
        wasNarrow.current = narrow;
        setState((s) => {
            if (narrow) {
                wideOpen.current = { left: s.leftOpen, right: s.rightOpen };
                return { ...s, leftOpen: false, rightOpen: false };
            }
            return { ...s, leftOpen: wideOpen.current.left, rightOpen: wideOpen.current.right };
        });
    }, [narrow]);

    // 넓은 화면의 값만 보관한다(좁은 화면의 서랍 여닫기는 그때뿐이다)
    useEffect(() => { if (!narrow) savePanels(state); }, [state, narrow]);

    const setWidth = useCallback((side: 'left' | 'right', w: number) => {
        setState((s) => (side === 'left' ? { ...s, leftW: w } : { ...s, rightW: w }));
    }, []);

    const toggle = useCallback((side: 'left' | 'right', open: boolean) => {
        // 좁은 화면에선 한 번에 하나만 — 둘이 겹치면 뒤엣것이 앞엣것을 가린다
        setState((s) => (narrow ? openOne(s, side, open)
            : side === 'left' ? { ...s, leftOpen: open } : { ...s, rightOpen: open }));
    }, [narrow]);

    const setPinned = useCallback((side: 'left' | 'right', pinned: boolean) => {
        setState((s) => (side === 'left' ? { ...s, leftPinned: pinned } : { ...s, rightPinned: pinned }));
    }, []);

    return { state, setWidth, toggle, setPinned };
}
