/**
 * 옆 패널 껍데기 — 세 가지 몸짓.
 *   ① 붙박이(고정 📌 · 넓은 화면): 자리를 차지하고 끌어서 폭 조절 + 접기.
 *   ② 덮는 서랍(고정 풀림 · 넓은 화면): 자리를 안 먹고 위로 떠서 덮는다. 바깥을 누르거나 Esc 로 자동 접힘.
 *   ③ 좁은 화면: 늘 ②처럼 덮는 서랍(어두운 막 포함).
 * 접힌 상태(넓은 화면)는 가는 레일 하나 — 펴기 단추만 있다. 도메인을 모른다(제목·이름을 안 그린다).
 *
 * 🔴 손잡이는 pointer 이벤트로 받는다(mouse 가 아니라) — 그래야 폰·태블릿 손가락에서도 끌린다.
 * 🔴 접기/펴기·📌 단추 자체는 여기 없다 — 안에 든 탭 줄(WorkspaceView rootChrome)·빈 면(EmptyArea)이 그린다.
 *    (옵시디언처럼 「사이드바 탭 줄 바깥 끝」에 산다 — 쥔님 지시 2026-10-31)
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '../primitives/IconButton';
import { RAIL, widthFromDrag } from '../layout/panels';

interface Props {
    side: 'left' | 'right';
    open: boolean;
    /** 고정(📌) — 걸리면 붙박이, 풀리면 덮는 서랍(자동 접힘) */
    pinned: boolean;
    width: number;
    narrow: boolean;
    onWidth: (w: number) => void;
    onToggle: (open: boolean) => void;
    children: ReactNode;
}

export function SidePanel({ side, open, pinned, width, narrow, onWidth, onToggle, children }: Props) {
    const isLeft = side === 'left';
    // 좁은 화면이거나 고정이 풀리면 「덮는 서랍」이다 — 자리를 안 먹고 위로 뜬다
    const drawer = narrow || !pinned;

    // 나갈 때도 밀려 나가게 — 언마운트를 애니메이션 끝까지 미룬다. closing = 렌더는 됐는데 open 이 꺼진 사이
    const [rendered, setRendered] = useState(open);
    const closing = rendered && !open;
    useEffect(() => {
        if (open) { setRendered(true); return; }
        if (!rendered) return;
        // 움직임 줄이기면 애니메이션이 없다 — 끝을 기다리면 영영 안 사라진다. 바로 접는다
        const reduce = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { setRendered(false); return; }
        const t = window.setTimeout(() => setRendered(false), 200);   // .18s 애니메이션 + 여유
        return () => clearTimeout(t);
    }, [open, rendered]);

    // 덮는 서랍이 열려 있으면 Esc 로 접는다(바깥 클릭은 막이 받는다)
    useEffect(() => {
        if (!(drawer && open)) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggle(false); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [drawer, open, onToggle]);

    // ── 덮는 서랍(좁은 화면 또는 고정 풀림) ──
    if (drawer) {
        if (!rendered) {
            // 좁은 화면 닫힘은 가운데 탭 줄 단추로 연다(레일 없음) · 넓은 화면 고정 풀림 닫힘은 레일을 보인다
            if (narrow) return null;
            return <CollapsedRail isLeft={isLeft} onExpand={() => onToggle(true)} />;
        }
        const w = narrow ? 'min(86vw, 330px)' : width;
        const panelAnim = closing
            ? (isLeft ? 'drawer-out-left' : 'drawer-out-right')
            : (isLeft ? 'drawer-in-left' : 'drawer-in-right');
        // 막은 좁은 화면만 눈에 보인다(어둡게) — 나갈 땐 같이 흐려진다. 넓은 화면은 투명이라 애니메이션이 없어도 된다
        const scrimAnim = narrow ? (closing ? 'drawer-scrim-out' : 'drawer-scrim') : '';
        return (
            <div className="fixed inset-0 z-[150] flex" style={{ justifyContent: isLeft ? 'flex-start' : 'flex-end' }}>
                {/* 바깥 막 — 좁은 화면은 어둡게, 넓은 화면 고정 풀림은 투명(모달처럼 어둡히지 않는다). 누르면 접힌다 */}
                <button
                    className={`absolute inset-0 ${narrow ? 'bg-black/40' : 'bg-transparent'} ${scrimAnim}`}
                    onClick={() => onToggle(false)}
                    aria-label="사이드바 접기"
                />
                <div
                    className={`relative h-full bg-panel flex flex-col shadow-lg ${isLeft ? 'border-r' : 'border-l'} border-line ${panelAnim}`}
                    style={{ width: w }}
                >
                    <div className="flex-1 min-h-0 overflow-auto flex flex-col">{children}</div>
                </div>
            </div>
        );
    }

    // ── 넓은 화면 · 고정: 접힌 레일 ──
    if (!open) {
        return <CollapsedRail isLeft={isLeft} onExpand={() => onToggle(true)} />;
    }

    // ── 넓은 화면 · 고정 · 펼침: 붙박이 + 폭 손잡이 ──
    return (
        <aside
            className={`relative shrink-0 bg-panel ${isLeft ? 'border-r' : 'border-l'} border-line flex flex-col`}
            style={{ width }}
        >
            <div className="flex-1 min-h-0 overflow-auto flex flex-col">{children}</div>
            <ResizeHandle side={side} width={width} onWidth={onWidth} onCollapse={() => onToggle(false)} />
        </aside>
    );
}

/** 접힌 레일 — 펴기 단추 하나. ⛔ 이름(제목)을 그리지 않는다(도메인을 모른다) */
function CollapsedRail({ isLeft, onExpand }: { isLeft: boolean; onExpand: () => void }) {
    return (
        <aside
            className={`shrink-0 bg-panel ${isLeft ? 'border-r' : 'border-l'} border-line flex flex-col items-center py-2`}
            style={{ width: RAIL }}
        >
            <IconButton
                icon={isLeft ? 'right' : 'left'}
                label={`${isLeft ? '왼쪽' : '오른쪽'} 사이드바 펴기`}
                size={14}
                onClick={onExpand}
            />
        </aside>
    );
}

function ResizeHandle({
    side, width, onWidth, onCollapse,
}: { side: 'left' | 'right'; width: number; onWidth: (w: number) => void; onCollapse: () => void }) {
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
            aria-label="사이드바 폭 조절"
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
            // 잡는 자리는 좌우로 넉넉히, 보이는 띠는 가운데 1px (가는 띠는 손으로 못 잡는다)
            className={`resize-handle absolute top-0 bottom-0 w-3 cursor-col-resize z-20 touch-none
                ${isLeft ? '-right-1.5' : '-left-1.5'}`}
        >
            <div className={`resize-bar absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px ${dragging ? 'is-dragging' : ''}`} />
        </div>
    );
}
