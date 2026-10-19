/**
 * 옆 패널 껍데기 — 넓은 화면에선 「붙박이 + 끌어서 폭 조절 + 접기」, 좁은 화면에선 「덮는 서랍」.
 *
 * 🔴 손잡이는 pointer 이벤트로 받는다(mouse 가 아니라) — 그래야 폰·태블릿 손가락에서도 끌린다.
 *    마우스 전용으로 짜면 터치에서 아무 일도 안 일어나고, 그게 「모바일에서 깨진다」의 한 얼굴이다.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../ui/parts/Icon';
import { RAIL, widthFromDrag } from '../panels';

interface Props {
    side: 'left' | 'right';
    /** 패널 제목 — 좁은 화면 서랍의 머리와 접힌 레일의 세로 글씨에 쓴다 */
    title: string;
    open: boolean;
    width: number;
    narrow: boolean;
    onWidth: (w: number) => void;
    onToggle: (open: boolean) => void;
    children: ReactNode;
}

export function SidePanel({ side, title, open, width, narrow, onWidth, onToggle, children }: Props) {
    const isLeft = side === 'left';

    // ── 좁은 화면: 덮는 서랍 ──
    if (narrow) {
        if (!open) return null;
        return (
            <div className="fixed inset-0 z-[150] flex" style={{ justifyContent: isLeft ? 'flex-start' : 'flex-end' }}>
                <button
                    className="absolute inset-0 bg-black/40"
                    onClick={() => onToggle(false)}
                    aria-label={`${title} 닫기`}
                />
                <div
                    className={`relative h-full bg-panel flex flex-col shadow-2xl ${isLeft ? 'border-r' : 'border-l'} border-line`}
                    style={{ width: 'min(86vw, 330px)' }}
                >
                    <div className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-line">
                        <span className="text-[13px] font-semibold">{title}</span>
                        <button
                            className="ml-auto w-8 h-8 grid place-items-center rounded text-muted hover:text-text hover:bg-panel2"
                            onClick={() => onToggle(false)} title="닫기">
                            <Icon name="x" size={16} />
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto">{children}</div>
                </div>
            </div>
        );
    }

    // ── 넓은 화면: 접힌 레일 ──
    if (!open) {
        return (
            <aside
                className={`shrink-0 bg-panel ${isLeft ? 'border-r' : 'border-l'} border-line flex flex-col items-center py-2`}
                style={{ width: RAIL }}
            >
                <button
                    className="w-6 h-6 grid place-items-center rounded text-muted hover:text-text hover:bg-panel2"
                    onClick={() => onToggle(true)}
                    title={`${title} 펴기`}
                >
                    <Icon name={isLeft ? 'right' : 'left'} size={14} />
                </button>
                <span
                    className="mt-2 text-[11px] text-muted whitespace-nowrap select-none"
                    style={{ writingMode: 'vertical-rl' }}
                >
                    {title}
                </span>
            </aside>
        );
    }

    // ── 넓은 화면: 펼친 패널 + 손잡이 ──
    return (
        <aside
            className={`relative shrink-0 bg-panel ${isLeft ? 'border-r' : 'border-l'} border-line flex flex-col`}
            style={{ width }}
        >
            <div className="flex-1 min-h-0 overflow-auto">{children}</div>
            <ResizeHandle side={side} width={width} onWidth={onWidth} onCollapse={() => onToggle(false)} title={title} />
        </aside>
    );
}

function ResizeHandle({
    side, width, onWidth, onCollapse, title,
}: { side: 'left' | 'right'; width: number; onWidth: (w: number) => void; onCollapse: () => void; title: string }) {
    const isLeft = side === 'left';
    const [dragging, setDragging] = useState(false);
    const start = useRef<{ x: number; w: number } | null>(null);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        // ⚠️ 캡처는 「있으면 좋은 것」이다 — 실패해도 끄는 것 자체는 start.current 로 돈다
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        start.current = { x: e.clientX, w: width };
        setDragging(true);
    }, [width]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const s = start.current;
        if (!s) return;
        onWidth(widthFromDrag(side, s.w, e.clientX - s.x));
    }, [onWidth, side]);

    const end = useCallback(() => { start.current = null; setDragging(false); }, []);

    // 끄는 동안 화면 전체 커서를 바꾸고 글자 선택을 막는다 — 안 그러면 패널 글자가 드래그로 잡힌다
    useEffect(() => {
        if (!dragging) return;
        const prev = document.body.style.cursor;
        document.body.style.cursor = 'col-resize';
        document.body.classList.add('select-none');
        return () => { document.body.style.cursor = prev; document.body.classList.remove('select-none'); };
    }, [dragging]);

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`${title} 폭 조절`}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
            onDoubleClick={onCollapse}
            onKeyDown={(e) => {
                // 키보드로도 조절한다 — 손잡이에 Tab 으로 닿은 사람이 막히지 않게
                if (e.key === 'ArrowLeft') { e.preventDefault(); onWidth(widthFromDrag(side, width, -16)); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); onWidth(widthFromDrag(side, width, 16)); }
                else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCollapse(); }
            }}
            title="끌어서 폭 조절 · 두 번 눌러 접기"
            // 손잡이 자체는 1px 띠로 보이되 잡는 자리는 좌우로 넉넉히 둔다(가는 띠는 손으로 못 잡는다)
            className={`absolute top-0 bottom-0 w-3 cursor-col-resize z-20 group touch-none
                ${isLeft ? '-right-1.5' : '-left-1.5'}`}
            style={{ minWidth: 0 }}
        >
            <div className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px transition-colors
                ${dragging ? 'bg-accent w-0.5' : 'bg-transparent group-hover:bg-accent/60'}`} />
        </div>
    );
}
