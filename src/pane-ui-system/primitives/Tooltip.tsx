/**
 * 툴팁 — 브라우저 `title` 대신(지연·위치·좁은 화면 모두 창틀 한 곳). 자식 하나를 감싼다.
 *   - 마우스: 올리고 HOVER_MS 뒤 뜸 · 벗어나면 사라짐 · 포커스로도 뜸(키보드)
 *   - 손가락(호버 없음): 길게 누르면(LONG_PRESS_MS) 뜨고 손을 떼면 사라짐
 *   text 가 비면 아무것도 안 한다(자식만 그린다) — 설명이 없는 칸이 같은 코드 길을 탄다.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LONG_PRESS_MS } from '../interactive/timing';

const HOVER_MS = 500;
const GAP = 6;

export function Tooltip({ text, children, className }: { text?: string; children: ReactNode; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const timer = useRef<number | null>(null);
    const [rect, setRect] = useState<DOMRect | null>(null);

    const clear = () => { if (timer.current != null) { clearTimeout(timer.current); timer.current = null; } };
    const hide = () => { clear(); setRect(null); };
    const arm = (ms: number) => {
        clear();
        timer.current = window.setTimeout(() => { if (ref.current) setRect(ref.current.getBoundingClientRect()); }, ms);
    };
    useEffect(() => clear, []);

    if (!text) return <>{children}</>;
    return (
        <span
            ref={ref}
            className={className ?? 'inline-flex min-w-0'}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') arm(HOVER_MS); }}
            onPointerLeave={hide}
            onPointerDown={(e) => { if (e.pointerType !== 'mouse') arm(LONG_PRESS_MS); else hide(); }}
            onPointerUp={(e) => { if (e.pointerType !== 'mouse') hide(); }}
            onPointerCancel={hide}
            onFocus={() => arm(HOVER_MS)}
            onBlur={hide}
        >
            {children}
            {rect && createPortal(<Bubble rect={rect} text={text} />, document.body)}
        </span>
    );
}

function Bubble({ rect, text }: { rect: DOMRect; text: string }) {
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const el = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const r = el.current?.getBoundingClientRect();
        if (!r) return;
        let x = rect.left + rect.width / 2 - r.width / 2;
        let y = rect.bottom + GAP;
        x = Math.min(Math.max(GAP, x), window.innerWidth - r.width - GAP);
        if (y + r.height > window.innerHeight - GAP) y = Math.max(GAP, rect.top - r.height - GAP);   // 아래가 모자라면 위로
        setPos({ x, y });
    }, [rect]);
    return (
        <div
            ref={el}
            role="tooltip"
            data-tooltip
            className="fixed z-[300] max-w-60 rounded-md border border-line bg-panel px-2 py-1 text-note text-text shadow-lg pointer-events-none select-none"
            style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
        >
            {text}
        </div>
    );
}
