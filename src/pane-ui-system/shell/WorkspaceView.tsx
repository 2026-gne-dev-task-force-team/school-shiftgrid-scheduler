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
 * 🔴 W5 우클릭 메뉴는 전부 이미 있는 순수 연산(close·split·move)을 부른다 — 트리 연산을 새로 짜지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node, Leaf } from '../layout/tree';
import { flatten, firstTabs, lastTabs, MIN_FRACTION } from '../layout/tree';
import { getView } from '../view-registry';
import { IconButton } from '../primitives/IconButton';
import { ContextMenu, type MenuEntry } from '../primitives/ContextMenu';
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
    // ── W5 우클릭 메뉴가 부르는 것들 (전부 순수 연산 래퍼) ──
    onCloseOthers: (leafId: string) => void;
    onCloseRight: (leafId: string) => void;
    onMove: (leafId: string, to: 'left' | 'center' | 'right') => void;
}

/** 좁은 화면 가운데 탭 줄에 붙는 서랍·설정 손잡이 */
interface NarrowBar {
    onOpenLeft?: () => void;
    onOpenRight?: () => void;
    onOpenSettings?: () => void;
}

/** 루트 탭 줄의 바깥 끝에 끼우는 사이드바 꼭지(접기·📌) */
export interface RootChrome {
    side: 'left' | 'right';
    onCollapse: () => void;
    pinned: boolean;
    onTogglePin: () => void;
}

/**
 * 가운데 영역의 양 끝 슬롯 — 🔴 사이드바가 접혀 있을 때 「펴는 손잡이」가 여기로 온다(W6, 쥔님 2026-10-31).
 *   접힌 레일(28px)을 없앴으므로, 사이드바를 다시 펴는 길은 가운데 탭 줄 양 끝의 ◧/◨ 뿐이다.
 *   ⛔ 가운데 위에 얇은 줄을 따로 두지 않는다 — 첫/끝 탭 줄의 leading/trailing 에 끼운다(루트가 split 이어도).
 */
export interface CenterEdges {
    /** 왼쪽 사이드바 펴기 — 왼쪽 사이드바가 접혀 있을 때만 넘어온다(없으면 안 그린다) */
    onExpandLeft?: () => void;
    /** 오른쪽 사이드바 펴기 */
    onExpandRight?: () => void;
}

/** 가운데 끝 슬롯을 어느 탭 줄에 붙일지 + 콜백 — NodeView 가 받아 첫/끝 탭 줄에만 그린다 */
interface Edges {
    firstId: string | null;
    lastId: string | null;
    onExpandLeft?: () => void;
    onExpandRight?: () => void;
}

/** 우클릭 메뉴를 여는 통로 — NodeView 가 Tabs 에서 받아 끌어올린다 */
interface Ctx {
    onTab: (leafId: string, tabsId: string, x: number, y: number) => void;
    onBar: (tabsId: string, x: number, y: number) => void;
}

function toItems(leaves: Leaf[]): TabItem[] {
    return leaves.map((l) => ({ id: l.id, title: l.title, icon: getView(l.viewId)?.icon }));
}

export function WorkspaceView({
    node, narrow, activeLeafId, handlers, narrowBar,
    area = 'center',
    tabButtons = { add: true, splitRow: true },
    rootChrome,
    centerEdges,
}: {
    node: Node;
    narrow: boolean;
    /** 좁은 화면에서 어느 leaf 를 볼지(넓은 화면에선 각 tabs 의 activeId 를 쓴다) */
    activeLeafId?: string | null;
    handlers: WorkspaceHandlers;
    narrowBar?: NarrowBar;
    /** 이 뷰가 그리는 자리 — 우클릭 메뉴가 「지금 자리」를 비활성할 때 쓴다 */
    area?: 'left' | 'center' | 'right';
    tabButtons?: TabButtons;
    /** 사이드바일 때만 — 루트 탭 줄 바깥 끝에 접기·📌 를 끼운다 */
    rootChrome?: RootChrome;
    /** 가운데일 때만 — 접힌 사이드바를 펴는 ◧/◨ 를 첫·끝 탭 줄 바깥 끝에 끼운다(W6) */
    centerEdges?: CenterEdges;
}) {
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
    const close = useCallback(() => setMenu(null), []);

    const openTab = useCallback((leafId: string, tabsId: string, x: number, y: number) => {
        setMenu({
            x, y, items: [
                { label: '닫기', icon: 'x', onClick: () => handlers.onClose(leafId) },
                { label: '다른 탭 모두 닫기', onClick: () => handlers.onCloseOthers(leafId) },
                { label: '오른쪽 탭 닫기', onClick: () => handlers.onCloseRight(leafId) },
                { sep: true },
                { label: '좌우로 가르기', icon: 'split', onClick: () => handlers.onSplit(tabsId, 'row') },
                { label: '위아래로 가르기', icon: 'splitH', onClick: () => handlers.onSplit(tabsId, 'col') },
                { sep: true },
                { label: '왼쪽 사이드바로', icon: 'panelLeft', disabled: area === 'left', onClick: () => handlers.onMove(leafId, 'left') },
                { label: '오른쪽 사이드바로', icon: 'panelRight', disabled: area === 'right', onClick: () => handlers.onMove(leafId, 'right') },
                { label: '가운데로', disabled: area === 'center', onClick: () => handlers.onMove(leafId, 'center') },
                { sep: true },
                { label: '떼어 내기', icon: 'copy', disabled: true },   // W9 — 자리만 둔다
            ],
        });
    }, [handlers, area]);

    const openBar = useCallback((tabsId: string, x: number, y: number) => {
        setMenu({
            x, y, items: [
                { label: '새 탭', icon: 'plus', onClick: () => handlers.onAddToTabs(tabsId) },
                { label: '좌우로 가르기', icon: 'split', onClick: () => handlers.onSplit(tabsId, 'row') },
                { label: '위아래로 가르기', icon: 'splitH', onClick: () => handlers.onSplit(tabsId, 'col') },
            ],
        });
    }, [handlers]);

    const ctx: Ctx = { onTab: openTab, onBar: openBar };
    const menuEl = menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={close} />;

    if (narrow) {
        // 전부 펴서 탭 하나로 — split 은 안 그린다
        const leaves = flatten(node);
        const active = leaves.some((l) => l.id === activeLeafId) ? activeLeafId! : (leaves[0]?.id ?? null);
        const activeLeaf = leaves.find((l) => l.id === active) ?? null;
        const rootTabsId = firstTabs(node)?.id ?? null;
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
                    onContextTab={rootTabsId ? (id, x, y) => openTab(id, rootTabsId, x, y) : undefined}
                    onContextBar={rootTabsId ? (x, y) => openBar(rootTabsId, x, y) : undefined}
                />
                <EditorArea leaf={activeLeaf} />
                {menuEl}
            </div>
        );
    }
    const rootId = firstTabs(node)?.id ?? null;
    // 가운데 끝 슬롯 — 첫 탭 줄엔 ◧(왼쪽 펴기), 끝 탭 줄엔 ◨(오른쪽 펴기). 루트가 split 이어도 양 끝을 집는다
    const edges: Edges | undefined = centerEdges && {
        firstId: rootId,
        lastId: lastTabs(node)?.id ?? null,
        onExpandLeft: centerEdges.onExpandLeft,
        onExpandRight: centerEdges.onExpandRight,
    };
    return (
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <NodeView node={node} handlers={handlers} tabButtons={tabButtons} rootChrome={rootChrome} rootId={rootId} edges={edges} ctx={ctx} />
            {menuEl}
        </div>
    );
}

function NodeView({
    node, handlers, tabButtons, rootChrome, rootId, edges, ctx,
}: {
    node: Node;
    handlers: WorkspaceHandlers;
    tabButtons: TabButtons;
    rootChrome?: RootChrome;
    rootId: string | null;
    edges?: Edges;
    ctx: Ctx;
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
                icon={chrome.side === 'left' ? 'panelLeft' : 'panelRight'}
                label="사이드바 접기"
                onClick={chrome.onCollapse}
                className={chrome.side === 'left' ? 'mx-pad shrink-0' : 'mr-pad shrink-0'}
            />
        );
        // 🔴 가운데: 접힌 사이드바 펴는 ◧/◨ — 첫 탭 줄 왼끝 / 끝 탭 줄 오른끝에만(W6)
        const expandLeftBtn = edges?.onExpandLeft && node.id === edges.firstId && (
            <IconButton icon="panelLeft" label="왼쪽 사이드바 펴기" onClick={edges.onExpandLeft} className="mx-pad shrink-0" />
        );
        const expandRightBtn = edges?.onExpandRight && node.id === edges.lastId && (
            <IconButton icon="panelRight" label="오른쪽 사이드바 펴기" onClick={edges.onExpandRight} className="mr-pad shrink-0" />
        );
        const leading = chrome?.side === 'left' ? collapseBtn : (expandLeftBtn || undefined);
        const trailing = chrome?.side === 'right' ? collapseBtn : (expandRightBtn || undefined);
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
                    leading={leading}
                    trailing={trailing}
                    actions={actions}
                    onContextTab={(id, x, y) => ctx.onTab(id, node.id, x, y)}
                    onContextBar={(x, y) => ctx.onBar(node.id, x, y)}
                />
                <EditorArea leaf={activeLeaf} />
            </div>
        );
    }
    return <SplitView node={node} handlers={handlers} tabButtons={tabButtons} rootChrome={rootChrome} rootId={rootId} edges={edges} ctx={ctx} />;
}

function SplitView({
    node, handlers, tabButtons, rootChrome, rootId, edges, ctx,
}: {
    node: Extract<Node, { kind: 'split' }>;
    handlers: WorkspaceHandlers;
    tabButtons: TabButtons;
    rootChrome?: RootChrome;
    rootId: string | null;
    edges?: Edges;
    ctx: Ctx;
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
                        <NodeView node={child} handlers={handlers} tabButtons={tabButtons} rootChrome={rootChrome} rootId={rootId} edges={edges} ctx={ctx} />
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
