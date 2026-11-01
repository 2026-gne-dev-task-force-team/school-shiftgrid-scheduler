/**
 * 피크(W9) — 잠깐 뜨는 페이지. 독(사이드바)이 아니라 「임시로 뜨는 사이드바」다(쥔님 2026-11-01).
 *   같은 더미(floating: Leaf[])를 두 그림이 그린다:
 *     - 데스크톱: 가운데와 오른쪽 독 사이에 서는 세로 기둥 — 가운데를 **민다**(덮지 않는다). 끌어 폭 조절.
 *     - 모바일(narrow): **바텀 시트** — 아래에서 올라와 **덮는다**. 두 단(반/거의 전체) snap · 끌어 닫기.
 *   맨 끝 한 장만 보인다. 여러 장 쌓이면 머리에 ←(한 장 되돌림) + 「n장」. × 는 전부 닫기.
 *
 * 🔴 바깥 클릭·Esc 로 닫히지 않는다(쥔님: "안 닫힌다" — 본문을 만지며 보라고 있는 것이다). × 와 승격만.
 * 🔴 저장되지 않는다 — 더미는 workspace-store 가 비운다. 이 조각은 그리기만 한다(상태는 호스트가 쥔다).
 * 🔴 ⛔ 도메인을 모른다 — EditorArea 로 가운데와 **같은 render** 를 쓴다(피크용 화면을 따로 안 만든다).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Leaf, MovePos } from '../layout/tree';
import { widthFromDrag } from '../layout/panels';
import { sheetSnap } from '../layout/mobile';
import { IconButton } from '../primitives/IconButton';
import { BottomSheet } from '../primitives/BottomSheet';
import { useDragLeaf } from '../primitives/useDragLeaf';
import { EditorArea } from './EditorArea';
import { DropZones } from './DropZones';
import { resolveDropAt } from './drop-resolve';

export interface PeekPanelProps {
    /** 피크 더미(= ws.floating). 맨 끝이 보이는 한 장 */
    stack: Leaf[];
    narrow: boolean;
    /** 데스크톱 기둥 폭(기기별 보관) */
    width: number;
    minWidth?: number;
    maxWidth?: number;
    onWidth: (w: number) => void;
    /** ← 한 장 되돌림 */
    onPop: () => void;
    /** × 전부 닫기 */
    onClear: () => void;
    /** ⤢ 탭으로 승격(가운데로) */
    onPromote: () => void;
    /** 머리줄을 끌어 가운데로 승격(드래그) — 존 판정은 resolveDropAt, 모델은 moveLeaf */
    onDropLeaf?: (leafId: string, target: string, pos: MovePos) => void;
    /**
     * 데스크톱 방식 — 'push'(기본) 는 가운데를 밀고 들어온다 · 'overlay' 는 가운데 **위에 떠서 덮는다**(폭 0 자리 + 절대 배치).
     * 쥔님 2026-11-01 13:34: *"화면이 부족해서 밀어내서 보는 게 안 될 수도 — 밀어내지 말고 살짝 뜨는 형식"*
     */
    mode?: 'push' | 'overlay';
}

export function PeekPanel(props: PeekPanelProps) {
    return props.narrow ? <MobilePeek {...props} /> : <DesktopPeek {...props} />;
}

/** 머리줄 — ← · 제목 · ⤢ · ×. dragBind 가 있으면 머리줄을 잡아 끌 수 있다(데스크톱 승격) */
function PeekHeader({
    top, depth, onPop, onClear, onPromote, onCollapse, rowId,
    dragBind, dragHandlers,
}: {
    top: Leaf;
    depth: number;
    onPop: () => void;
    onClear: () => void;
    onPromote: () => void;
    /** 접기(데스크톱만) — 오른쪽 벽에 세로 손잡이로 남는다. 모바일 시트는 끌어 내리면 되니 없다 */
    onCollapse?: () => void;
    rowId?: string;
    dragBind?: React.HTMLAttributes<HTMLDivElement>;
    dragHandlers?: boolean;
}) {
    return (
        <div
            className="shrink-0 flex items-center gap-1 h-topbar border-b border-line bg-panel2 px-pad"
            data-row-id={dragHandlers ? rowId : undefined}
            title={dragHandlers ? top.title : undefined}
            {...(dragHandlers ? dragBind : {})}
        >
            {depth > 1 && (
                <IconButton icon="left" label="한 장 뒤로" onClick={onPop} className="shrink-0" />
            )}
            {/* 🔴 제목은 기울임꼴 + 「미리 보기」 뱃지 — VS Code 미리 보기 탭이 임시를 표시하는 방식(쥔님 13:31 이름 확정) */}
            <span className="flex-1 min-w-0 truncate text-[13px] italic text-text select-none">{top.title}</span>
            <span className="shrink-0 text-[10px] px-1 rounded bg-text/[0.06] text-muted select-none">미리 보기</span>
            {depth > 1 && (
                <span className="shrink-0 text-[11px] text-muted/70 select-none tabular-nums px-1">{depth}장</span>
            )}
            {/* 🔴 승격은 글자 단추 — 화살표 아이콘은 「접기」로 읽혔다(쥔님 13:36 *"화살표는 잠시 닫는 느낌인데 다시 열 방법이 없네"*) */}
            <button
                type="button"
                onClick={onPromote}
                title="이 미리 보기를 가운데 탭으로 옮긴다"
                className="shrink-0 h-btn px-2 rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.05] transition-colors select-none"
            >탭으로</button>
            {onCollapse && (
                <IconButton icon="panelRight" label="접기 — 오른쪽 벽에 손잡이로 남는다" onClick={onCollapse} className="shrink-0" />
            )}
            <IconButton icon="x" label="미리 보기 닫기" onClick={onClear} className="shrink-0" />
        </div>
    );
}

// ─────────────────────────── 데스크톱 기둥 ───────────────────────────

function DesktopPeek({
    stack, width, minWidth = 150, maxWidth = 900, onWidth, onPop, onClear, onPromote, onDropLeaf, mode = 'push',
}: PeekPanelProps) {
    const overlay = mode === 'overlay';
    // 🔴 접기 — 카드를 치우되 더미는 그대로. 오른쪽 벽에 세로 손잡이(제목)가 남아 누르면 다시 편다(쥔님 13:36).
    //    새 장이 올라오거나 ←로 장이 바뀌면 저절로 펴진다(top 이 바뀌면 리셋).
    const has = stack.length > 0;
    const topId = stack[stack.length - 1]?.id ?? null;
    const [collapsed, setCollapsed] = useState(false);
    useEffect(() => { setCollapsed(false); }, [topId]);
    const open = has && !collapsed;
    // 나갈 때도 밀려 나가게 — 언마운트를 폭 전환 끝까지 미룬다(SidePanel 붙박이와 같은 결)
    const [rendered, setRendered] = useState(open);
    const [shown, setShown] = useState(open);

    useEffect(() => {
        if (open) {
            setRendered(true);
            const r = requestAnimationFrame(() => setShown(true));   // 0 → width 로 밀고 들어온다
            return () => cancelAnimationFrame(r);
        }
        setShown(false);
        const reduce = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { setRendered(false); return; }
        const t = window.setTimeout(() => setRendered(false), 200);   // .18s 폭 전환 + 여유
        return () => clearTimeout(t);
    }, [open]);

    // 머리줄 드래그 → 가운데로 승격(존 판정 재사용). 좁은 화면이 아니니 enabled 참
    const onDrop = useCallback((leafId: string, x: number, y: number) => {
        const res = resolveDropAt(x, y, leafId);
        if (res && onDropLeaf) onDropLeaf(leafId, res.move.target, res.move.pos);
    }, [onDropLeaf]);
    // 피크 머리줄엔 우클릭 메뉴가 없다(틀 메뉴는 탭 줄의 것) — onContext 는 빈 함수
    const { bind, drag } = useDragLeaf({ enabled: true, onContext: () => {}, onDrop });

    const top = stack[stack.length - 1] ?? null;
    if (!rendered) {
        // 접힌 손잡이 — 폭 0 자리의 오른쪽 벽에 세로 글자 탭(인덱스 스티커). 누르면 펴진다
        if (!(has && collapsed && top)) return null;
        return (
            <aside className="relative shrink-0 w-0 overflow-visible z-30" data-area="floating" aria-label="미리 보기(접힘)">
                <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    title={`${top.title} — 미리 보기 펴기`}
                    className="absolute right-0 top-1/2 -translate-y-1/2 max-h-[40%] px-1.5 py-3 rounded-l-lg bg-panel peek-card text-[11px] text-muted hover:text-text select-none overflow-hidden"
                    style={{ writingMode: 'vertical-rl' }}
                >
                    <span className="truncate italic">{top.title}</span>
                </button>
            </aside>
        );
    }

    return (
        // 🔴 data-area="floating" — 가운데 탭을 이 기둥에 떨구면 피크로(drop-resolve 가 'floating' 으로 번역)
        // 🔴 바깥 틀은 가운데를 「밀고」(폭 전환), 안쪽 카드는 「벽에서 튀어나온다」(peek-in/out) — 둘이 다른 물건이다.
        //    틀 바탕은 에디터와 같은 bg-bg 라 카드가 그 위에 떠 보인다 · 카드는 오른쪽 벽에 붙고 왼쪽 모서리만 둥글다.
        // 🔴 overlay 면 틀은 폭 0(자리를 안 먹는다) + 카드를 절대 배치로 왼쪽(가운데 위)에 띄운다 — 가운데는 그대로.
        <aside
            className={overlay
                ? 'relative shrink-0 w-0 overflow-visible z-40'
                : 'relative shrink-0 bg-bg flex flex-col overflow-hidden pane-wtrans'}
            style={overlay ? undefined : { width: shown ? width : 0 }}
            data-area="floating"
            aria-label="미리 보기"
        >
            {top && (
                // overlay: 자리(폭 0)의 오른쪽 끝에서 왼쪽으로 W 만큼 떠 있는 틀 — 손잡이는 이 틀의 왼쪽 모서리에 산다
                <div
                    className={overlay ? 'absolute top-2 bottom-2 right-0' : 'relative h-full py-2 pl-2'}
                    style={{ width: overlay ? width : undefined }}
                >
                    <div
                        className={`flex flex-col h-full rounded-l-xl bg-panel peek-card overflow-hidden ${shown ? 'peek-in' : 'peek-out'}`}
                        style={{ width: Math.max(0, width - 8), marginLeft: overlay ? 8 : 0 }}
                    >
                        <PeekHeader
                            top={top}
                            depth={stack.length}
                            onPop={onPop}
                            onClear={onClear}
                            onPromote={onPromote}
                            onCollapse={() => setCollapsed(true)}
                            rowId={top.id}
                            dragBind={bind}
                            dragHandlers
                        />
                        <EditorArea leaf={top} />
                    </div>
                    <PeekResizeHandle width={width} minWidth={minWidth} maxWidth={maxWidth} onWidth={onWidth} />
                </div>
            )}
            {drag && <DropZones drag={drag} />}
        </aside>
    );
}

/** 기둥 왼쪽 모서리의 폭 손잡이 — 왼쪽으로 끌면 넓어진다(오른쪽 패널과 같은 부호). SidePanel 결 그대로 */
function PeekResizeHandle({
    width, minWidth, maxWidth, onWidth,
}: { width: number; minWidth: number; maxWidth: number; onWidth: (w: number) => void }) {
    const [dragging, setDragging] = useState(false);
    const start = useRef<{ x: number; w: number } | null>(null);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        start.current = { x: e.clientX, w: width };
        setDragging(true);
    }, [width]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const s = start.current;
        if (!s) return;
        onWidth(widthFromDrag('right', s.w, e.clientX - s.x, minWidth, maxWidth));
    }, [onWidth, minWidth, maxWidth]);

    const end = useCallback(() => { start.current = null; setDragging(false); }, []);

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
            aria-label="피크 폭 조절"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') { e.preventDefault(); onWidth(widthFromDrag('right', width, -16, minWidth, maxWidth)); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); onWidth(widthFromDrag('right', width, 16, minWidth, maxWidth)); }
            }}
            title="끌어서 폭 조절"
            className="resize-handle absolute top-0 bottom-0 -left-1.5 w-3 cursor-col-resize z-20 touch-none"
        >
            <div className={`resize-bar absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px ${dragging ? 'is-dragging' : ''}`} />
        </div>
    );
}

// ─────────────────────────── 모바일 바텀 시트 ───────────────────────────

const SHEET_START_VH = 50;    // 반쯤 올라와 시작
const SHEET_MIN_VH = 12;      // 끌어 내릴 때 바닥(이 아래 놓으면 닫힘 판정)
const SHEET_MAX_VH = 95;

function MobilePeek({ stack, onPop, onClear, onPromote }: PeekPanelProps) {
    const open = stack.length > 0;
    const [vh, setVh] = useState(SHEET_START_VH);
    const [dragging, setDragging] = useState(false);
    const live = useRef(SHEET_START_VH);
    const grip = useRef<{ y: number; vh: number; id: number } | null>(null);

    // 열릴 때마다 중간 높이에서 다시 시작한다(임시 — 지난 높이를 기억하지 않는다)
    useEffect(() => {
        if (open) { setVh(SHEET_START_VH); live.current = SHEET_START_VH; }
    }, [open]);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        grip.current = { y: e.clientY, vh: live.current, id: e.pointerId };
        setDragging(true);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const g = grip.current;
        if (!g || e.pointerId !== g.id) return;
        const dy = g.y - e.clientY;    // 위로 끌면 +
        const h = typeof window !== 'undefined' ? window.innerHeight : 800;
        const next = Math.max(SHEET_MIN_VH, Math.min(SHEET_MAX_VH, g.vh + (dy / h) * 100));
        live.current = next;
        setVh(next);
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        const g = grip.current;
        if (!g || e.pointerId !== g.id) return;
        grip.current = null;
        setDragging(false);
        const snap = sheetSnap(live.current / 100);   // 🔴 두 단/닫힘 판정(순수)
        if (snap == null) { onClear(); return; }       // 끌어 내려 닫기
        live.current = snap * 100;
        setVh(snap * 100);
    }, [onClear]);

    const top = stack[stack.length - 1] ?? null;
    const gripProps = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };

    return (
        <BottomSheet
            open={open}
            onClose={onClear}
            label="피크"
            dismissOnScrim={false}   // 🔴 막을 눌러도 안 닫힌다(쥔님)
            dismissOnEsc={false}
            heightVh={vh}
            heightSmooth={!dragging}
            gripProps={gripProps}
            gripActive={dragging}
        >
            {top && (
                <div className="flex flex-col h-full">
                    <PeekHeader top={top} depth={stack.length} onPop={onPop} onClear={onClear} onPromote={onPromote} />
                    <EditorArea leaf={top} />
                </div>
            )}
        </BottomSheet>
    );
}
