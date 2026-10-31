/**
 * 트리 그리기 — 한 Node 를 재귀로 그린다. 가운데든 사이드바든 같은 그림이다(W3).
 *   split → 자식들을 비율대로 나란히 + 칸 사이 스플리터
 *   tabs  → 탭 줄(Tabs) + 활성 leaf 몸통(EditorArea)
 *
 * 🔴 좁은 화면(narrow)에서는 split 을 안 그린다 — flatten() 으로 모든 leaf 를 펴서 탭 하나로 본다.
 *    ⛔ 모델은 그대로 둔다(그림만 다르다). 넓은 화면으로 돌아가면 가른 배치가 살아 있다.
 * 🔴 색·px 는 토큰 클래스로만(구조 검사 ①). 손잡이는 pointer 이벤트(터치 됨).
 *
 * ⭐ 탭 줄 단추는 자리(area)마다 다르다 — 가운데는 「+새 탭·좌우 가르기」, 사이드바는 「위아래 가르기」.
 *    어느 단추를 그릴지는 tabButtons 로 받는다. ⛔ 창틀은 그 자리가 무엇인지(도메인)는 모른다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node, Leaf } from '../layout/tree';
import { flatten, firstTabs, MIN_FRACTION } from '../layout/tree';
import { getView } from '../view-registry';
import { IconButton } from '../primitives/IconButton';
import { Tabs, type TabItem } from './Tabs';
import { EditorArea } from './EditorArea';

/** 탭 줄에 그릴 단추 — 자리마다 다르다 */
export interface TabButtons {
    /** + 새 탭 */
    add?: boolean;
    /** 좌우로 가르기 */
    splitRow?: boolean;
    /** 위아래로 가르기 */
    splitCol?: boolean;
}

export interface WorkspaceHandlers {
    onActivate: (leafId: string) => void;
    onClose: (leafId: string) => void;
    onSplit: (tabsId: string, dir: 'row' | 'col') => void;
    onResize: (splitId: string, sizes: number[]) => void;
    onAddToTabs: (tabsId: string) => void;
    /** 좁은 화면 탭 줄의 + — 가운데에 새 탭 */
    onAddGlobal: () => void;
}

/** 좁은 화면 가운데 탭 줄에 붙는 서랍·설정 손잡이 */
interface NarrowBar {
    onOpenLeft?: () => void;
    onOpenRight?: () => void;
    onOpenSettings?: () => void;
}

/** 루트 탭 줄의 바깥 끝에 끼우는 사이드바 꼭지(접기·📌) — ② 에서 채운다 */
export interface RootChrome {
    side: 'left' | 'right';
    onCollapse: () => void;
    pinned: boolean;
    onTogglePin: () => void;
}

function toItems(leaves: Leaf[]): TabItem[] {
    return leaves.map((l) => ({ id: l.id, title: l.title, icon: getView(l.viewId)?.icon }));
}

export function WorkspaceView({
    node, narrow, activeLeafId, handlers, narrowBar,
    area = 'center',
    tabButtons = { add: true, splitRow: true },
    rootChrome,
}: {
    node: Node;
    narrow: boolean;
    /** 좁은 화면에서 어느 leaf 를 볼지(넓은 화면에선 각 tabs 의 activeId 를 쓴다) */
    activeLeafId?: string | null;
    handlers: WorkspaceHandlers;
    narrowBar?: NarrowBar;
    /** 이 뷰가 그리는 자리 — 우클릭 메뉴가 「지금 자리」를 비활성할 때 쓴다(③) */
    area?: 'left' | 'center' | 'right';
    tabButtons?: TabButtons;
    /** 사이드바일 때만 — 루트 탭 줄 바깥 끝에 접기·📌 를 끼운다 */
    rootChrome?: RootChrome;
}) {
    void area;
    if (narrow) {
        // 전부 펴서 탭 하나로 — split 은 안 그린다
        const leaves = flatten(node);
        const active = leaves.some((l) => l.id === activeLeafId) ? activeLeafId! : (leaves[0]?.id ?? null);
        const activeLeaf = leaves.find((l) => l.id === active) ?? null;
        const narrowActions = (
            <>
                {tabButtons.add && <IconButton icon="plus" label="새 탭" onClick={handlers.onAddGlobal} />}
                {narrowBar?.onOpenSettings && (
                    <IconButton icon="gear" label="설정 열기" onClick={narrowBar.onOpenSettings} />
                )}
            </>
        );
        return (
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                <Tabs
                    tabs={toItems(leaves)}
                    activeId={active}
                    onSelect={handlers.onActivate}
                    onClose={handlers.onClose}
                    leading={narrowBar?.onOpenLeft
                        ? <IconButton icon="panelLeft" label="왼쪽 사이드바" onClick={narrowBar.onOpenLeft} className="mx-pad shrink-0" />
                        : undefined}
                    trailing={narrowBar?.onOpenRight
                        ? <IconButton icon="panelRight" label="오른쪽 사이드바" onClick={narrowBar.onOpenRight} className="mr-pad shrink-0" />
                        : undefined}
                    actions={narrowActions}
                />
                <EditorArea leaf={activeLeaf} />
            </div>
        );
    }
    const rootId = firstTabs(node)?.id ?? null;
    return <NodeView node={node} handlers={handlers} tabButtons={tabButtons} rootChrome={rootChrome} rootId={rootId} />;
}

function NodeView({
    node, handlers, tabButtons, rootChrome, rootId,
}: {
    node: Node;
    handlers: WorkspaceHandlers;
    tabButtons: TabButtons;
    rootChrome?: RootChrome;
    rootId: string | null;
}) {
    if (node.kind === 'leaf') {
        // 불변식상 맨몸 leaf 는 안 오지만, 방어적으로 그린다
        return <EditorArea leaf={node} />;
    }
    if (node.kind === 'tabs') {
        const activeLeaf = node.children.find((c) => c.id === node.activeId) ?? null;
        // 접기·📌 는 루트 탭 줄 하나에만 끼운다(루트가 split 이면 맨 앞 탭 줄에 붙는다 — rootId 로 가른다)
        const isRoot = rootChrome != null && node.id === rootId;
        const chrome = isRoot ? rootChrome! : undefined;
        const collapseBtn = chrome && (
            <IconButton
                icon={chrome.side === 'left' ? 'left' : 'right'}
                label="사이드바 접기"
                onClick={chrome.onCollapse}
                className={chrome.side === 'left' ? 'mx-pad shrink-0' : 'mr-pad shrink-0'}
            />
        );
        const actions = (
            <>
                {tabButtons.splitRow && (
                    <IconButton icon="split" label="좌우로 가르기" onClick={() => handlers.onSplit(node.id, 'row')} />
                )}
                {tabButtons.splitCol && (
                    <IconButton icon="splitH" label="위아래로 가르기" onClick={() => handlers.onSplit(node.id, 'col')} />
                )}
                {tabButtons.add && (
                    <IconButton icon="plus" label="새 탭" onClick={() => handlers.onAddToTabs(node.id)} />
                )}
                {chrome && (
                    <IconButton
                        icon="pin"
                        label={chrome.pinned ? '사이드바 고정 해제' : '사이드바 고정'}
                        active={chrome.pinned}
                        onClick={chrome.onTogglePin}
                    />
                )}
            </>
        );
        return (
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                <Tabs
                    tabs={toItems(node.children)}
                    activeId={node.activeId || null}
                    onSelect={handlers.onActivate}
                    onClose={handlers.onClose}
                    leading={chrome?.side === 'left' ? collapseBtn : undefined}
                    trailing={chrome?.side === 'right' ? collapseBtn : undefined}
                    actions={actions}
                />
                <EditorArea leaf={activeLeaf} />
            </div>
        );
    }
    return <SplitView node={node} handlers={handlers} tabButtons={tabButtons} rootChrome={rootChrome} rootId={rootId} />;
}

function SplitView({
    node, handlers, tabButtons, rootChrome, rootId,
}: {
    node: Extract<Node, { kind: 'split' }>;
    handlers: WorkspaceHandlers;
    tabButtons: TabButtons;
    rootChrome?: RootChrome;
    rootId: string | null;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const isRow = node.dir === 'row';
    return (
        <div ref={ref} className={`flex-1 min-w-0 min-h-0 flex ${isRow ? 'flex-row' : 'flex-col'}`}>
            {node.children.map((child, i) => (
                <div key={child.id} style={{ display: 'contents' }}>
                    <div
                        className="flex min-w-0 min-h-0 overflow-hidden"
                        style={{ flexBasis: `${(node.sizes[i] ?? 0) * 100}%`, flexGrow: 0, flexShrink: 1 }}
                    >
                        <NodeView node={child} handlers={handlers} tabButtons={tabButtons} rootChrome={rootChrome} rootId={rootId} />
                    </div>
                    {i < node.children.length - 1 && (
                        <SplitHandle
                            dir={node.dir}
                            index={i}
                            sizes={node.sizes}
                            containerRef={ref}
                            onResize={(s) => handlers.onResize(node.id, s)}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

function SplitHandle({
    dir, index, sizes, containerRef, onResize,
}: {
    dir: 'row' | 'col';
    index: number;
    sizes: number[];
    containerRef: React.RefObject<HTMLDivElement | null>;
    onResize: (sizes: number[]) => void;
}) {
    const isRow = dir === 'row';
    const [dragging, setDragging] = useState(false);
    const start = useRef<{ pos: number; sizes: number[] } | null>(null);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        start.current = { pos: isRow ? e.clientX : e.clientY, sizes: [...sizes] };
        setDragging(true);
    }, [isRow, sizes]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const s = start.current;
        const el = containerRef.current;
        if (!s || !el) return;
        const rect = el.getBoundingClientRect();
        const total = isRow ? rect.width : rect.height;
        if (total <= 0) return;
        const d = ((isRow ? e.clientX : e.clientY) - s.pos) / total;
        const pair = s.sizes[index] + s.sizes[index + 1];
        let a = s.sizes[index] + d;
        a = Math.max(MIN_FRACTION, Math.min(pair - MIN_FRACTION, a));
        const next = [...s.sizes];
        next[index] = a;
        next[index + 1] = pair - a;
        onResize(next);
    }, [isRow, index, containerRef, onResize]);

    const end = useCallback(() => { start.current = null; setDragging(false); }, []);

    // 끄는 동안 커서 바꾸고 글자 선택 막기
    useEffect(() => {
        if (!dragging) return;
        const prev = document.body.style.cursor;
        document.body.style.cursor = isRow ? 'col-resize' : 'row-resize';
        document.body.classList.add('select-none');
        return () => { document.body.style.cursor = prev; document.body.classList.remove('select-none'); };
    }, [dragging, isRow]);

    return (
        <div
            role="separator"
            aria-orientation={isRow ? 'vertical' : 'horizontal'}
            aria-label="칸 비율 조절"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => {
                const el = containerRef.current;
                const total = el ? (isRow ? el.getBoundingClientRect().width : el.getBoundingClientRect().height) : 0;
                if (total <= 0) return;
                const step = 16 / total;
                const dir2 = (isRow && e.key === 'ArrowLeft') || (!isRow && e.key === 'ArrowUp') ? -1
                    : (isRow && e.key === 'ArrowRight') || (!isRow && e.key === 'ArrowDown') ? 1 : 0;
                if (!dir2) return;
                e.preventDefault();
                const pair = sizes[index] + sizes[index + 1];
                let a = sizes[index] + dir2 * step;
                a = Math.max(MIN_FRACTION, Math.min(pair - MIN_FRACTION, a));
                const next = [...sizes];
                next[index] = a;
                next[index + 1] = pair - a;
                onResize(next);
            }}
            title="끌어서 칸 비율 조절"
            className={`resize-handle relative z-20 touch-none shrink-0 ${isRow ? 'w-3 -mx-1.5 cursor-col-resize' : 'h-3 -my-1.5 cursor-row-resize'}`}
        >
            <div
                className={`resize-bar absolute ${dragging ? 'is-dragging' : ''} ${isRow
                    ? 'top-0 bottom-0 left-1/2 -translate-x-1/2 w-px'
                    : 'left-0 right-0 top-1/2 -translate-y-1/2 h-px'}`}
            />
        </div>
    );
}
