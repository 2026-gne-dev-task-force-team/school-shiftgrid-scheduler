/**
 * 작은 팝오버 — 단추(anchor) 아래에 뜨는 패널. 바깥 클릭·Esc·바깥 스크롤에 닫히고, 화면 가장자리에서 안으로 밀린다.
 *   🔴 ContextMenu(단추 목록)와 달리 안에 입력칸·고르기를 담는 「폼」이라 따로 둔다. 색·치수는 토큰 클래스로만.
 *   - 내용이 바뀌어 크기가 달라지면(ResizeObserver) 자리를 다시 잰다 — 아래가 모자라면 위로 뒤집힌다.
 *   - 스크롤: 팝오버 바깥이 스크롤되면 닫는다(자리가 어긋나기 전에). 팝오버 안쪽 스크롤은 닫지 않는다.
 *   - Esc: 떠 있는 층 줄(layers.ts)로 — 자기만 닫고 바깥 Dialog 는 안 닫는다.
 *   메뉴 꼴 목록이 필요하면 안에 MenuList 를 담는다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useExitClose } from './presence';
import { pushEscapeLayer, useLayerToken, LayerContext } from './layers';

const GAP = 6;

export function Popover({
    anchor,
    onClose: onCloseProp,
    children,
    width = 280,
    align = 'left',
}: {
    /** 기준 요소의 화면 사각형(getBoundingClientRect) */
    anchor: DOMRect;
    onClose: () => void;
    children?: ReactNode;
    width?: number;
    align?: 'left' | 'right';
}) {
    const ref = useRef<HTMLDivElement>(null);
    const { closing, close: onClose } = useExitClose(onCloseProp);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const layer = useLayerToken();
    const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
        x: align === 'right' ? anchor.right - width : anchor.left,
        y: anchor.bottom + 4,
    }));

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const place = () => {
            const r = el.getBoundingClientRect();
            let x = align === 'right' ? anchor.right - r.width : anchor.left;
            let y = anchor.bottom + 4;
            if (x + r.width > window.innerWidth - GAP) x = window.innerWidth - r.width - GAP;
            if (y + r.height > window.innerHeight - GAP) y = Math.max(GAP, anchor.top - r.height - 4);
            const next = { x: Math.max(GAP, x), y: Math.max(GAP, y) };
            setPos((p) => (p.x === next.x && p.y === next.y ? p : next));
        };
        place();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(place);
        ro.observe(el);
        return () => ro.disconnect();
    }, [anchor, align]);

    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            const t = e.target as Element;
            // 안에서 띄운 팝오버(날짜 칸 등)는 포털이라 ref 밖이다 — 그 클릭은 바깥 클릭이 아니다
            if (!ref.current?.contains(t) && !t.closest?.('[data-popover]')) closeRef.current();
        };
        const onScroll = (e: Event) => {
            const t = e.target as Node | null;
            if (t instanceof Node && (ref.current?.contains(t) || (t instanceof Element && t.closest('[data-popover]')))) return;
            closeRef.current();
        };
        const popEsc = pushEscapeLayer(() => closeRef.current(), layer);
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            popEsc();
            document.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [layer]);

    return createPortal(
        <div
            ref={ref}
            data-popover
            className={`fixed z-popover rounded-md border border-line bg-panel shadow-lg p-2 select-none ${closing ? 'ui-pop-out pointer-events-none' : 'ui-pop-in'}`}
            style={{ left: pos.x, top: pos.y, width }}
        >
            <LayerContext.Provider value={layer}>{children}</LayerContext.Provider>
        </div>,
        document.body,
    );
}
