/**
 * 퇴장 전환 — 닫힘도 열림처럼 짧게(--motion-fast .12s). 움직임 줄이기면 즉시.
 *  - usePresence(open, ms): open 이 꺼져도 ms 동안 mounted 를 유지한다(closing=true 로 .ui-pop-out 을 건다).
 *  - useExitClose(onClose, ms): 부모가 「닫기」로 언마운트하는 부품용 — 닫기 요청을 ms 뒤로 미룬다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const EXIT_MS = 120;

export function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePresence(open: boolean, ms: number = EXIT_MS): { mounted: boolean; closing: boolean } {
    const [mounted, setMounted] = useState(open);
    useEffect(() => {
        if (open) { setMounted(true); return; }
        if (prefersReducedMotion()) { setMounted(false); return; }
        const t = setTimeout(() => setMounted(false), ms);
        return () => clearTimeout(t);
    }, [open, ms]);
    return { mounted: open || mounted, closing: !open && mounted };
}

export function useExitClose(onClose: () => void, ms: number = EXIT_MS): { closing: boolean; close: () => void } {
    const [closing, setClosing] = useState(false);
    const closingRef = useRef(false);
    const cbRef = useRef(onClose);
    cbRef.current = onClose;
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    const close = useCallback(() => {
        if (closingRef.current) return;
        closingRef.current = true;
        if (prefersReducedMotion()) { cbRef.current(); return; }
        setClosing(true);
        timer.current = setTimeout(() => cbRef.current(), ms);
    }, [ms]);
    return { closing, close };
}
