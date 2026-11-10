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
    initialFocus = true,
}: {
    /** 기준 요소의 화면 사각형(getBoundingClientRect) */
    anchor: DOMRect;
    onClose: () => void;
    children?: ReactNode;
    width?: number;
    align?: 'left' | 'right';
    /** false 면 뜰 때 안쪽 첫 입력칸으로 초점을 안 보낸다(팝오버 자신이 받는다) — 열자마자 친 글자가 입력칸에 들어가면 안 되는 메뉴용 */
    initialFocus?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const { closing, close: onClose } = useExitClose(onCloseProp);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const layer = useLayerToken();
    // 연 자리 — 렌더에서 잡는다(닫히면 초점을 돌려주려고)
    const [opener] = useState(() => (typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null));
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
        // 열리면 안의 첫 조작 요소로 초점(안쪽이 이미 가져갔으면 그대로) — 팝오버 자신이 초점 폴백
        const el = ref.current;
        if (el && !el.contains(document.activeElement)) {
            ((initialFocus ? el.querySelector<HTMLElement>('input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])') : null) ?? el).focus({ preventScroll: true });
        }
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            popEsc();
            document.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('scroll', onScroll, true);
            // 닫히면 연 자리로 — 초점이 갈 곳 없이 BODY 로 빠졌을 때만(다른 곳을 눌러 닫은 거면 그 초점을 존중)
            const a = document.activeElement;
            if ((!a || a === document.body) && opener && opener !== document.body && opener.isConnected) opener.focus?.({ preventScroll: true });
        };
    }, [layer, opener]);

    return createPortal(
        <div
            ref={ref}
            data-popover
            tabIndex={-1}
            className={`fixed z-popover rounded-md border border-line bg-panel shadow-lg p-2 select-none outline-none ${closing ? 'ui-pop-out pointer-events-none' : 'ui-pop-in'}`}
            style={{ left: pos.x, top: pos.y, width }}
        >
            <LayerContext.Provider value={layer}>{children}</LayerContext.Provider>
        </div>,
        document.body,
    );
}
