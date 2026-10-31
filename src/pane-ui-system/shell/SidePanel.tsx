/**
 * 옆 패널 껍데기 — 세 가지 몸짓.
 *   ① 붙박이(고정 📌 · 넓은 화면): 자리를 차지하고 끌어서 폭 조절 + 접기.
 *   ② 덮는 서랍(고정 풀림 · 넓은 화면): 자리를 안 먹고 위로 떠서 덮는다. 바깥을 누르거나 Esc 로 자동 접힘.
 *   ③ 좁은 화면: 늘 ②처럼 덮는 서랍(어두운 막 포함).
 * 접힌 상태는 폭 0 — 레일을 남기지 않는다(W6, 쥔님 2026-10-31 "접었는데 세로 긴 선 남으면 의미 없어").
 *   붙박이는 폭을 0↔W 로 애니메이션(W7) · 다시 펴는 ◧/◨ 는 가운데 탭 줄 양 끝에 산다(WorkspaceView centerEdges).
 *
 * 🔴 손잡이는 pointer 이벤트로 받는다(mouse 가 아니라) — 그래야 폰·태블릿 손가락에서도 끌린다.
 * 🔴 접기/펴기·📌 단추 자체는 여기 없다 — 안에 든 탭 줄(WorkspaceView rootChrome)·빈 면(EmptyArea)이 그린다.
 *    (옵시디언처럼 「사이드바 탭 줄 바깥 끝」에 산다 — 쥔님 지시 2026-10-31)
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { widthFromDrag } from '../layout/panels';

interface Props {
    side: 'left' | 'right';
    open: boolean;
    /** 고정(📌) — 걸리면 붙박이, 풀리면 덮는 서랍(자동 접힘) */
    pinned: boolean;
    width: number;
    /** 🔴 끌어 줄일 수 있는 최소/최대 폭(px) — 앱이 「설정 기본값 ⊔ 그 안 뷰 힌트」로 계산해 준다(W4) */
    minWidth: number;
    maxWidth: number;
    narrow: boolean;
    onWidth: (w: number) => void;
    onToggle: (open: boolean) => void;
    children: ReactNode;
}

export function SidePanel({ side, open, pinned, width, minWidth, maxWidth, narrow, onWidth, onToggle, children }: Props) {
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
        // 🔴 접힌 사이드바는 폭 0 으로 완전히 사라진다 — 레일(28px) 없음(W6). 다시 펴는 길은 가운데 탭 줄 양 끝의 ◧/◨
        if (!rendered) return null;
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

    // ── 넓은 화면 · 고정(붙박이) ──
    // 🔴 접어도 레일을 남기지 않는다 — 폭을 0 까지 줄인다(W6). 항상 마운트해 두고 폭만 0↔W 로
    //    애니메이션한다(W7, .pane-wtrans · 움직임 줄이기면 즉시). 다시 펴는 ◧ 는 가운데 탭 줄 끝에 있다.
    // ⭐ 안쪽 내용은 접히는 동안 고정 폭(width)을 지키며 overflow-hidden 으로 미끄러져 나간다(글자가 안 찌그러진다).
    return (
        <aside
            className={`relative shrink-0 bg-panel flex flex-col overflow-hidden pane-wtrans
                ${open ? (isLeft ? 'border-r border-line' : 'border-l border-line') : ''}`}
            style={{ width: open ? width : 0 }}
            aria-hidden={!open}
        >
            <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ width }}>{children}</div>
            {open && <ResizeHandle side={side} width={width} minWidth={minWidth} maxWidth={maxWidth} onWidth={onWidth} onCollapse={() => onToggle(false)} />}
        </aside>
    );
}

function ResizeHandle({
    side, width, minWidth, maxWidth, onWidth, onCollapse,
}: { side: 'left' | 'right'; width: number; minWidth: number; maxWidth: number; onWidth: (w: number) => void; onCollapse: () => void }) {
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
        // 🔴 min/max 는 앱이 뷰 힌트까지 반영해 준다 — 이 아래로는 안 줄어든다(쥔님: "무한정 줄이지 말고")
        onWidth(widthFromDrag(side, s.w, e.clientX - s.x, minWidth, maxWidth));
    }, [onWidth, side, minWidth, maxWidth]);

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
                if (e.key === 'ArrowLeft') { e.preventDefault(); onWidth(widthFromDrag(side, width, -16, minWidth, maxWidth)); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); onWidth(widthFromDrag(side, width, 16, minWidth, maxWidth)); }
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
