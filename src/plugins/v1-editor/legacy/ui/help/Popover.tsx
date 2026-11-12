/**
 * 뷰포트 인식 팝오버 — createPortal 로 document.body 에 position:fixed 로 그린다.
 *  · 기본은 앵커(버튼) 아래·왼쪽 정렬. 오른쪽이 넘치면 오른쪽 정렬, 그래도 넘치면 좌우 clamp.
 *  · 아래 공간이 내용보다 작고 위가 더 넉넉하면 위로 편다. 어느 쪽이든 maxHeight + overflow-y:auto.
 *  · 모바일(vw<768)은 폭 vw-16 · 왼쪽 8 고정.
 *  · 닫힘: 바깥 mousedown · Escape(stopImmediatePropagation) · 앵커가 화면에서 사라질 때.
 *  ⭐ ⓘ 툴팁이 화면 오른쪽에서 잘리던 버그를 이 부품이 고친다.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Pos { left: number; top: number; maxH: number; w: number }

export function Popover<T extends HTMLElement = HTMLElement>({
    anchorRef, open, onClose, width = 340, children, zIndex = 260,
}: {
    anchorRef: React.RefObject<T | null>;
    open: boolean;
    onClose: () => void;
    width?: number;
    children: ReactNode;
    zIndex?: number;
}) {
    const popRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<Pos | null>(null);

    const recompute = useCallback(() => {
        const anchor = anchorRef.current;
        const pop = popRef.current;
        if (!anchor || !pop) return;
        const rect = anchor.getBoundingClientRect();
        // 앵커가 화면에서 사라졌으면 닫는다
        if (rect.width === 0 && rect.height === 0) { onClose(); return; }

        const vw = window.innerWidth, vh = window.innerHeight;
        const mobile = vw < 768;
        const w = mobile ? vw - 16 : Math.min(width, vw - 16);
        const contentH = pop.scrollHeight;

        // 가로 자리
        let left: number;
        if (mobile) {
            left = 8;
        } else {
            left = rect.left;                                   // 아래·왼쪽 정렬
            if (left + w > vw - 8) left = rect.right - w;       // 오른쪽이 넘치면 오른쪽 정렬
            left = Math.min(Math.max(8, left), vw - w - 8);     // 그래도 넘치면 clamp
        }

        // 세로 자리
        const belowSpace = vh - rect.bottom - 8;
        const aboveSpace = rect.top - 8;
        const cap = Math.min(Math.round(vh * 0.7), 560);
        const openUp = belowSpace < contentH && aboveSpace > belowSpace;
        const availSpace = openUp ? aboveSpace : belowSpace;
        const maxH = Math.min(cap, Math.max(80, availSpace));
        const usedH = Math.min(contentH, maxH);
        const top = openUp ? Math.max(8, rect.top - 8 - usedH) : rect.bottom + 8;

        setPos((prev) => {
            if (prev && prev.left === left && prev.top === top && prev.maxH === maxH && prev.w === w) return prev;
            return { left, top, maxH, w };
        });
    }, [anchorRef, width, onClose]);

    // 렌더 직후 자리 계산(깜빡임 없이) + 내용·앵커·창 변화에 재계산
    useLayoutEffect(() => { if (open) recompute(); }, [open, recompute]);
    useEffect(() => {
        if (!open) return;
        recompute();
        const ro = new ResizeObserver(() => recompute());
        if (popRef.current) ro.observe(popRef.current);
        if (anchorRef.current) ro.observe(anchorRef.current);
        const onScrollResize = () => recompute();
        window.addEventListener('resize', onScrollResize);
        window.addEventListener('scroll', onScrollResize, true);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', onScrollResize);
            window.removeEventListener('scroll', onScrollResize, true);
        };
    }, [open, recompute, anchorRef]);

    // 닫힘 — 바깥 mousedown · Escape
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popRef.current?.contains(t)) return;
            if (anchorRef.current?.contains(t)) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
        };
        window.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [open, onClose, anchorRef]);

    if (!open) return null;

    // pos 가 아직 없으면(첫 측정 전) vw 로 폭만 잡아 숨긴 채 렌더 — scrollHeight 측정용
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const w = pos?.w ?? (vw < 768 ? vw - 16 : Math.min(width, vw - 16));

    return createPortal(
        <div ref={popRef} role="dialog"
            className="rounded-lg border border-line bg-panel shadow-xl"
            style={{
                position: 'fixed',
                zIndex,
                left: pos?.left ?? 0,
                top: pos?.top ?? 0,
                width: w,
                maxHeight: pos?.maxH,
                overflowY: 'auto',
                visibility: pos ? 'visible' : 'hidden',
            }}>
            {children}
        </div>,
        document.body,
    );
}
