/**
 * 작은 팝오버 — 단추(anchor) 아래에 뜨는 패널. 바깥 클릭·Esc·스크롤에 닫히고, 화면 가장자리에서 안으로 밀린다.
 *   🔴 ContextMenu(단추 목록)와 달리 안에 입력칸·고르기를 담는 「폼」이라 따로 둔다. 색·치수는 토큰 클래스로만.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

const GAP = 6;

export function Popover({
    anchor,
    onClose,
    children,
    width = 280,
    align = 'left',
}: {
    /** 기준 요소의 화면 사각형(getBoundingClientRect) */
    anchor: DOMRect;
    onClose: () => void;
    children: ReactNode;
    width?: number;
    align?: 'left' | 'right';
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
        x: align === 'right' ? anchor.right - width : anchor.left,
        y: anchor.bottom + 4,
    }));

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        let x = align === 'right' ? anchor.right - r.width : anchor.left;
        let y = anchor.bottom + 4;
        if (x + r.width > window.innerWidth - GAP) x = window.innerWidth - r.width - GAP;
        if (y + r.height > window.innerHeight - GAP) y = Math.max(GAP, anchor.top - r.height - 4);
        setPos({ x: Math.max(GAP, x), y: Math.max(GAP, y) });
    }, [anchor, align]);

    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            if (!ref.current?.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[200] rounded-md border border-line bg-panel shadow-lg p-2 select-none"
            style={{ left: pos.x, top: pos.y, width }}
        >
            {children}
        </div>,
        document.body,
    );
}
