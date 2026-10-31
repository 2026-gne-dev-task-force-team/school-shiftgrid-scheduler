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
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { widthFromDrag } from '../layout/panels';
import { SWIPE_EDGE, classifySwipe, swipeProgress, settleOpen, type SwipeAxis } from '../layout/mobile';

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

    // ── 좁은 화면 서랍의 스와이프 (③) ──
    // 🔴 가장자리에서 안쪽으로 끌면 손가락을 따라 열리고, 열린 서랍을 바깥으로 끌면 닫힌다.
    //    세로 스크롤과 안 싸우게 10px 데드존으로 축을 잠근 뒤에만 가로를 가져간다(layout/mobile).
    //    놓는 순간 절반(settleOpen)을 넘었으면 확정, 아니면 되돌아간다 — 그 사이(settling) 짧게 미끄러진다.
    const [entered, setEntered] = useState(open);   // 좁은 화면 전용: 0↔1 미끄러짐의 목표 위치
    const [drag, setDrag] = useState<{ progress: number; settling: boolean } | null>(null);
    const gesture = useRef<{ opening: boolean; startX: number; startY: number; width: number; axis: SwipeAxis; id: number } | null>(null);
    const settleTimer = useRef<number | null>(null);

    // 열림이 바뀌면 한 프레임 뒤 entered 를 맞춰 미끄러지게(마운트 직후면 0→1 로 들어온다). 좁은 화면에서만.
    useEffect(() => {
        if (!narrow) return;
        if (open) {
            const r = requestAnimationFrame(() => setEntered(true));
            return () => cancelAnimationFrame(r);
        }
        setEntered(false);
    }, [open, narrow]);
    useEffect(() => () => { if (settleTimer.current != null) clearTimeout(settleTimer.current); }, []);

    const estWidth = useCallback(() => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
        return Math.min(vw * 0.86, 330);
    }, []);

    // opening=true → 가장자리 띠(여는 스와이프) · opening=false → 열린 패널(닫는 스와이프)
    const onSwipeDown = useCallback((opening: boolean) => (e: React.PointerEvent) => {
        if (!narrow || e.pointerType === 'mouse') return;   // 스와이프는 손가락만(마우스는 단추로)
        gesture.current = { opening, startX: e.clientX, startY: e.clientY, width: estWidth(), axis: 'none', id: e.pointerId };
    }, [narrow, estWidth]);

    const onSwipeMove = useCallback((e: React.PointerEvent) => {
        const g = gesture.current;
        if (!g || e.pointerId !== g.id) return;
        const dx = e.clientX - g.startX;
        const dy = e.clientY - g.startY;
        if (g.axis === 'none') {
            const a = classifySwipe(dx, dy);
            if (a === 'none') return;
            if (a === 'vertical') { gesture.current = null; return; }   // 세로 스크롤 — 양보한다
            g.axis = 'horizontal';
            try { (e.currentTarget as HTMLElement).setPointerCapture(g.id); } catch { /* 무시 */ }
        }
        e.preventDefault();
        setDrag({ progress: swipeProgress(side, g.opening, dx, g.width), settling: false });
    }, [side]);

    const onSwipeUp = useCallback((e: React.PointerEvent) => {
        const g = gesture.current;
        if (!g || e.pointerId !== g.id) return;
        gesture.current = null;
        if (g.axis !== 'horizontal') { setDrag(null); return; }
        const dx = e.clientX - g.startX;
        const willOpen = settleOpen(swipeProgress(side, g.opening, dx, g.width));
        const changed = willOpen !== open;
        setDrag({ progress: willOpen ? 1 : 0, settling: true });   // 남은 거리를 미끄러져 확정
        settleTimer.current = window.setTimeout(() => {
            setEntered(willOpen);
            if (changed) onToggle(willOpen);
            setDrag(null);
        }, 180);
    }, [side, open, onToggle]);

    // ── 좁은 화면 서랍(③ 스와이프 + 미끄러짐) ──
    if (drawer && narrow) {
        const dragging = drag != null;
        const visible = rendered || dragging;
        // 닫혀 있는 동안 가장자리 20px 띠로 여는 스와이프를 받는다(드래그 중에도 떠 있어 포인터 캡처가 안 끊긴다)
        const band = !open && (
            <div
                aria-hidden="true"
                className={`fixed top-0 bottom-0 z-[130] ${isLeft ? 'left-0' : 'right-0'}`}
                style={{ width: SWIPE_EDGE, touchAction: 'pan-y' }}
                onPointerDown={onSwipeDown(true)}
                onPointerMove={onSwipeMove}
                onPointerUp={onSwipeUp}
                onPointerCancel={onSwipeUp}
            />
        );
        if (!visible) return band || null;

        const progress = dragging ? drag.progress : (entered ? 1 : 0);
        const off = isLeft ? (progress - 1) * 100 : (1 - progress) * 100;
        // 손가락을 따라가는 동안엔 전환을 끈다(즉각) · 확정 중(settling)·단추 여닫기엔 켠다(미끄러짐)
        const smooth = !dragging || drag.settling;
        const panelStyle: CSSProperties = { width: 'min(86vw, 330px)', transform: `translateX(${off}%)` };
        const scrimStyle: CSSProperties = { opacity: progress };
        return (
            <>
                {band}
                <div className="fixed inset-0 z-[150] flex" style={{ justifyContent: isLeft ? 'flex-start' : 'flex-end' }}>
                    <button
                        className={`absolute inset-0 bg-black/40 ${smooth ? 'pane-strans' : ''}`}
                        style={scrimStyle}
                        onClick={() => onToggle(false)}
                        aria-label="사이드바 접기"
                    />
                    <div
                        className={`relative h-full bg-side flex flex-col shadow-lg ${isLeft ? 'border-r' : 'border-l'} border-edge ${smooth ? 'pane-strans' : ''}`}
                        style={panelStyle}
                        // 열려 있을 때만 바깥으로 끌어 닫기 — 세로 스크롤은 그대로(touch-action: pan-y)
                        onPointerDown={open ? onSwipeDown(false) : undefined}
                        onPointerMove={open ? onSwipeMove : undefined}
                        onPointerUp={open ? onSwipeUp : undefined}
                        onPointerCancel={open ? onSwipeUp : undefined}
                    >
                        <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ touchAction: 'pan-y' }}>{children}</div>
                    </div>
                </div>
            </>
        );
    }

    // ── 덮는 서랍(넓은 화면 고정 풀림) ──
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
            // 🔴 ④ drawer-layer — 탭을 끄는 동안엔 이 막 전체가 포인터를 통과시킨다(body.is-dragging, index.css). 안 그러면
            //    비고정 서랍이 열린 채 탭을 끌 때 elementFromPoint 가 막을 집어 「사이드바↔가운데 이동이 안 되는」 것처럼 보인다(실측).
            //    단 서랍 본체(drawer-panel)는 다시 살려 둔다 — 그 사이드바 위로 떨구는 길은 열어 둔다.
            <div className="drawer-layer fixed inset-0 z-[150] flex" style={{ justifyContent: isLeft ? 'flex-start' : 'flex-end' }}>
                {/* 바깥 막 — 좁은 화면은 어둡게, 넓은 화면 고정 풀림은 투명(모달처럼 어둡히지 않는다). 누르면 접힌다 */}
                <button
                    className={`absolute inset-0 ${narrow ? 'bg-black/40' : 'bg-transparent'} ${scrimAnim}`}
                    onClick={() => onToggle(false)}
                    aria-label="사이드바 접기"
                />
                <div
                    className={`drawer-panel relative h-full bg-side flex flex-col shadow-lg ${isLeft ? 'border-r' : 'border-l'} border-edge ${panelAnim}`}
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
            className={`relative shrink-0 bg-side flex flex-col overflow-hidden pane-wtrans
                ${open ? (isLeft ? 'border-r border-edge' : 'border-l border-edge') : ''}`}
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
