/**
 * 트리 그리기 — 한 Node 를 재귀로 그린다. 가운데든 사이드바든 같은 그림이다(W3).
 *   split → 자식들을 비율대로 나란히 + 칸 사이 스플리터
 *   tabs  → 탭 줄(Tabs) + 활성 leaf 몸통(EditorArea)
 *
 * 🔴 좁은 화면(narrow)에서는 split 을 안 그린다 — flatten() 으로 모든 leaf 를 펴서 탭 하나로 본다.
 *    ⛔ 모델은 그대로 둔다(그림만 다르다). 넓은 화면으로 돌아가면 가른 배치가 살아 있다.
 * 🔴 색·px 는 토큰 클래스로만(구조 검사 ①). 손잡이는 pointer 이벤트(터치 됨).
 *
 * ⭐ 탭 줄 단추는 자리(area)마다 다르다 — 가운데는 「+새 탭·좌우 가르기」, 사이드바는 없다(⛔ 사이드바는 안 가른다 — 쥔님 01:51).
 *    어느 단추를 그릴지는 tabButtons 로 받는다. ⛔ 창틀은 그 자리가 무엇인지(도메인)는 모른다.
 * 🔴 W5 우클릭 메뉴는 전부 이미 있는 순수 연산(close·split·move)을 부른다 — 트리 연산을 새로 짜지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node, Leaf, MovePos } from '../layout/tree';
import { flatten, firstTabs, lastTabs, MIN_FRACTION } from '../layout/tree';
import { getView } from '../view-registry';
import { effectiveViewLayout } from '../layout/pane-settings';
import { effectiveMin, clampSplitPair } from '../layout/clamp';
import { IconButton } from '../primitives/IconButton';
import { ContextMenu, type MenuEntry } from '../primitives/ContextMenu';
import { useDragLeaf, type DragBind } from '../primitives/useDragLeaf';
import { Tabs, type TabItem } from './Tabs';
import { EditorArea } from './EditorArea';
import { DropZones } from './DropZones';
import { resolveDropAt } from './drop-resolve';

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
    /**
     * 가르기 — 🔴 내용(탭)의 조작이다. sourceLeafId 탭을 **복제**해 옆에 새 묶음으로 둔다(새 「표 N」 아님).
     *   옵시디언·VS Code 가 그렇게 한다. 상시 ⬓ 단추는 활성 탭, 우클릭 메뉴는 그 탭을 넘긴다.
     */
    onSplit: (tabsId: string, dir: 'row' | 'col', sourceLeafId: string) => void;
    onResize: (splitId: string, sizes: number[]) => void;
    onAddToTabs: (tabsId: string) => void;
    /** 좁은 화면 탭 줄의 + — 가운데에 새 탭 */
    onAddGlobal: () => void;
    /**
     * 🔴 + 가 무엇을 여는지의 이름 — 앱이 준다(⛔ 창틀은 「표」를 모른다, 쥔님 2026-11-01).
     *   안 주면 뜻 없는 「새 탭」. 앱이 '새 표' 를 넘기면 단추·메뉴 글자가 그걸 쓴다.
     */
    addLabel?: string;
    // ── W5 우클릭 메뉴가 부르는 것들 (전부 순수 연산 래퍼) ──
    onCloseOthers: (leafId: string) => void;
    onCloseRight: (leafId: string) => void;
    onMove: (leafId: string, to: 'left' | 'center' | 'right') => void;
    /** 내용 메뉴 「이름 바꾸기」가 쓴다 — leaf 제목만 바꾼다(틀 모양은 안 바뀐다) */
    onRename: (leafId: string, title: string) => void;
    /**
     * 🔴 드래그 드롭(W6·W7) — target 은 기준 leaf id 또는 자리 이름('left'|'center'|'right'), pos 는 6방.
     *   전부 moveLeaf 한 번으로 번역된 값이다(존 판정은 resolveDropAt 이 이미 끝냈다).
     */
    onDropLeaf: (leafId: string, target: string, pos: MovePos) => void;
    /** 키보드 Alt+←/→ 로 같은 줄 안에서 한 칸 옮기기(W6 ④). 안 주면 키보드 재배치는 없다 */
    onReorderTab?: (leafId: string, delta: -1 | 1) => void;
    /** 「떼어 내기」(W9) — 이 탭을 피크 더미로 옮긴다(moveLeaf …'floating'). 안 주면 메뉴 항목이 비활성 */
    onDetach?: (leafId: string) => void;
    /**
     * 🔴 「모든 탭 메뉴」 기여 — 플러그인이 host.menu 로 꽂은 항목. 틀·내용 메뉴 뒤에 붙는다.
     *   ⛔ 창틀은 항목의 뜻을 모른다 — 앱이 이 leaf 로 factory 를 불러 MenuEntry 를 받아 넘긴다.
     */
    tabMenu?: (leaf: Leaf) => MenuEntry[];
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

function toItems(leaves: Leaf[]): TabItem[] {
    return leaves.map((l) => ({ id: l.id, title: l.title, icon: getView(l.viewId)?.icon }));
}

export function WorkspaceView({
    node, narrow, activeLeafId, handlers,
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
    // 🔴 사이드바인가(판 A) — 가운데가 아니면 사이드바답게 그린다(탭 줄·몸통 바탕을 한 단 어둡게).
    const sidebar = area !== 'center';

    const openTab = useCallback((lf: Leaf, tabsId: string, x: number, y: number) => {
        const leafId = lf.id;
        // 🔴 틀 메뉴 — 닫기·가르기·이동(창틀의 조작). ⛔ 여기까진 도메인 모름
        const frame: MenuEntry[] = [
            { label: '닫기', icon: 'x', onClick: () => handlers.onClose(leafId) },
            { label: '다른 탭 모두 닫기', onClick: () => handlers.onCloseOthers(leafId) },
            { label: '오른쪽 탭 닫기', onClick: () => handlers.onCloseRight(leafId) },
            { sep: true },
            // 🔴 가르기는 이 탭을 복제한다 — tabsId 안에서 leafId 를 넘긴다(내용 조작)
            // ⛔ 사이드바에선 안 준다 — 쥔님 2026-11-01 01:51: *"사이드 패널에는 굳이 분할이 필요 없잖아"*
            ...(area === 'center' ? [
                { label: '오른쪽으로 가르기', icon: 'split', onClick: () => handlers.onSplit(tabsId, 'row', leafId) },
                { label: '아래로 가르기', icon: 'splitH', onClick: () => handlers.onSplit(tabsId, 'col', leafId) },
                { sep: true },
            ] as MenuEntry[] : []),
            { label: '왼쪽 사이드바로', icon: 'panelLeft', disabled: area === 'left', onClick: () => handlers.onMove(leafId, 'left') },
            { label: '오른쪽 사이드바로', icon: 'panelRight', disabled: area === 'right', onClick: () => handlers.onMove(leafId, 'right') },
            { label: '가운데로', disabled: area === 'center', onClick: () => handlers.onMove(leafId, 'center') },
            { sep: true },
            // 🔴 W9 — 이 탭을 피크(임시로 뜨는 페이지)로 보낸다. onDetach 를 안 주면 비활성(자리만)
            { label: '떼어 내기', icon: 'copy', disabled: !handlers.onDetach, onClick: () => handlers.onDetach?.(leafId) },
        ];
        // 🔴 내용 메뉴 — 그 뷰가 menu() 로 준 항목. 구분선 뒤에 붙는다(틀과 구분된다, 쥔님 지시)
        //    ⛔ 창틀은 항목의 뜻을 모른다 — host(rename·close)만 내주고 뷰가 라벨을 붙인다
        const def = getView(lf.viewId);
        const content = def?.menu?.(lf, {
            rename: (title) => handlers.onRename(leafId, title),
            close: () => handlers.onClose(leafId),
        }) ?? [];
        // 🔴 플러그인이 꽂은 「모든 탭 메뉴」 항목 — 틀·내용 뒤에 붙는다
        const extra = handlers.tabMenu?.(lf) ?? [];
        const items: MenuEntry[] = [...frame];
        if (content.length) items.push({ sep: true }, ...content);
        if (extra.length) items.push({ sep: true }, ...extra);
        setMenu({ x, y, items });
    }, [handlers, area]);

    // 🔴 「틀 메뉴」 — 탭 줄 빈 자리 우클릭. 틀의 조작(새 탭)만 둔다. ⛔ 가르기는 여기 없다(그건 탭의 것 → openTab)
    const openBar = useCallback((tabsId: string, x: number, y: number) => {
        setMenu({
            x, y, items: [
                { label: handlers.addLabel ?? '새 탭', icon: 'plus', onClick: () => handlers.onAddToTabs(tabsId) },
            ],
        });
    }, [handlers]);

    // 🔴 드래그 + 우클릭/길게누르기 한 벌(W6). el 로 어느 탭/줄인지 더듬어 틀·내용 메뉴를 연다.
    const onContext = useCallback((x: number, y: number, el: HTMLElement) => {
        const tabsId = el.closest('[data-tabbar]')?.getAttribute('data-tabbar') ?? null;
        const leafId = el.closest('[data-row-id]')?.getAttribute('data-row-id') ?? null;
        if (leafId && tabsId) {
            const lf = flatten(node).find((l) => l.id === leafId);
            if (lf) { openTab(lf, tabsId, x, y); return; }
        }
        if (tabsId) openBar(tabsId, x, y);
    }, [node, openTab, openBar]);

    // 🔴 드롭 — 포인터를 뗀 자리를 resolveDropAt 이 moveLeaf 인자로 번역한다. 트리 연산은 새로 안 짠다.
    const onDrop = useCallback((leafId: string, x: number, y: number) => {
        const res = resolveDropAt(x, y, leafId);
        if (res) handlers.onDropLeaf(leafId, res.move.target, res.move.pos);
    }, [handlers]);

    const { bind, drag } = useDragLeaf({ enabled: !narrow, onContext, onDrop });

    const menuEl = menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={close} />;

    if (narrow) {
        // 🔴 좁은 화면: 탭 줄을 없앤다(탭 전환은 하단 바 ▦ → TabSwitcher 가 맡는다). split 도 안 그린다 —
        //    flatten() 으로 편 leaf 중 하나만 본다. 서랍 여닫기도 여기 없다(하단 바가 쥔다).
        //    대신 얇은 머리줄 하나: 현재 탭 제목 + ⋯. ⛔ 서랍 이름·탭 줄을 박지 않는다(쥔님 2026-10-31).
        const leaves = flatten(node);
        const active = leaves.some((l) => l.id === activeLeafId) ? activeLeafId! : (leaves[0]?.id ?? null);
        const activeLeaf = leaves.find((l) => l.id === active) ?? null;
        const rootTabsId = firstTabs(node)?.id ?? null;
        return (
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                <div className={`shrink-0 flex items-center gap-1 h-topbar border-b border-line px-pad ${sidebar ? 'bg-side2' : 'bg-panel2'}`}>
                    <span className="flex-1 min-w-0 truncate text-[13px] text-text select-none">{activeLeaf?.title ?? ''}</span>
                    {activeLeaf && rootTabsId && (
                        <IconButton
                            icon="dots"
                            label="이 탭 메뉴"
                            onClick={(e) => openTab(activeLeaf, rootTabsId, e.clientX, e.clientY)}
                            className="shrink-0"
                        />
                    )}
                </div>
                <EditorArea leaf={activeLeaf} sidebar={sidebar} />
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
        // 🔴 data-area — 드롭이 빈 칸으로 떨어질 때 「어느 자리인가」를 더듬는 기준(resolveDropAt)
        <div className="flex-1 min-w-0 min-h-0 flex flex-col" data-area={area}>
            <NodeView node={node} handlers={handlers} tabButtons={tabButtons} rootChrome={rootChrome} rootId={rootId} edges={edges} interaction={bind} sidebar={sidebar} />
            {menuEl}
            {drag && <DropZones drag={drag} />}
        </div>
    );
}

function NodeView({
    node, handlers, tabButtons, rootChrome, rootId, edges, interaction, sidebar = false,
}: {
    node: Node;
    handlers: WorkspaceHandlers;
    tabButtons: TabButtons;
    rootChrome?: RootChrome;
    rootId: string | null;
    edges?: Edges;
    /** 탭 드래그·우클릭 한 벌 — 모든 탭 줄에 같은 핸들러를 얹는다(위임, data-row-id 로 가른다) */
    interaction?: DragBind;
    /** 사이드바 자리인가(판 A) — 탭 줄·몸통 바탕을 한 단 어둡게 */
    sidebar?: boolean;
}) {
    if (node.kind === 'leaf') {
        // 불변식상 맨몸 leaf 는 안 오지만, 방어적으로 그린다
        return <EditorArea leaf={node} sidebar={sidebar} />;
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
        // 🔴 ⬓ 가르기 단추 = 내용(탭) 조작 — 활성 탭이 있을 때만 그린다(빈 묶음엔 안 그린다, W8 버그).
        //    누르면 활성 탭을 복제해 옆에. + 새 탭 = 틀 조작이라 늘 보인다.
        const splitSource = activeLeaf?.id;
        const actions = (
            <>
                {tabButtons.splitRow && splitSource && (
                    <IconButton icon="split" label="오른쪽으로 가르기" onClick={() => handlers.onSplit(node.id, 'row', splitSource)} />
                )}
                {tabButtons.splitCol && splitSource && (
                    <IconButton icon="splitH" label="아래로 가르기" onClick={() => handlers.onSplit(node.id, 'col', splitSource)} />
                )}
                {tabButtons.add && (
                    <IconButton icon="plus" label={handlers.addLabel ?? '새 탭'} onClick={() => handlers.onAddToTabs(node.id)} />
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
            // 🔴 data-pane/leaves/active — 드롭 존 판정이 이 묶음의 탭 목록·활성 탭을 더듬는 자리(resolveDropAt)
            <div
                className="flex-1 min-w-0 min-h-0 flex flex-col"
                data-pane={node.id}
                data-pane-leaves={node.children.map((c) => c.id).join(',')}
                data-pane-active={node.activeId}
            >
                <Tabs
                    tabsId={node.id}
                    tabs={toItems(node.children)}
                    activeId={node.activeId || null}
                    onSelect={handlers.onActivate}
                    onClose={handlers.onClose}
                    leading={leading}
                    trailing={trailing}
                    actions={actions}
                    interaction={interaction}
                    onKeyMove={handlers.onReorderTab}
                    sidebar={sidebar}
                />
                {/* 🔴 data-pane-body — 가장자리 4방·가운데 존은 이 몸통 사각형으로 판정한다(탭 줄 말고 몸통) */}
                <div className="flex-1 min-h-0 flex flex-col" data-pane-body>
                    <EditorArea leaf={activeLeaf} sidebar={sidebar} />
                </div>
            </div>
        );
    }
    return <SplitView node={node} handlers={handlers} tabButtons={tabButtons} rootChrome={rootChrome} rootId={rootId} edges={edges} interaction={interaction} sidebar={sidebar} />;
}

/** 한 노드의 「유효 최소폭」(px) — 활성 뷰의 minWidth(설정 덮어쓰기 포함). split 은 1차로 0(비율 하한만) */
function nodeMinWidth(node: Node): number {
    if (node.kind === 'leaf') return effectiveMin(0, effectiveViewLayout(node.viewId).minWidth);
    if (node.kind === 'tabs') {
        const active = node.children.find((c) => c.id === node.activeId) ?? node.children[0];
        return active ? effectiveMin(0, effectiveViewLayout(active.viewId).minWidth) : 0;
    }
    return 0;
}

function SplitView({
    node, handlers, tabButtons, rootChrome, rootId, edges, interaction, sidebar = false,
}: {
    node: Extract<Node, { kind: 'split' }>;
    handlers: WorkspaceHandlers;
    tabButtons: TabButtons;
    rootChrome?: RootChrome;
    rootId: string | null;
    edges?: Edges;
    interaction?: DragBind;
    sidebar?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const isRow = node.dir === 'row';
    // 🔴 px 최소폭은 좌우(row) 가르기에서만 뜻이 있다 — 위아래(col)는 높이 문제라 1차에선 비율 하한만
    const mins = isRow ? node.children.map(nodeMinWidth) : node.children.map(() => 0);
    // 🔴 ③ 스플리터로 끄는 동안엔 칸 비율 transition 을 끈다(끌림이 둔해지지 않게, 쥔님 2026-11-01)
    const [dragging, setDragging] = useState(false);
    // 🔴 ③ 생길 때 「새 칸이 밀고 들어온다」 — 마지막 칸을 0 에서 키우고 그 몫은 앞 칸이 가득 머금었다 내준다.
    //    SplitView 는 split 이 생길 때 새로 마운트되니(트리 구조가 바뀜) 이 첫 그림이 곧 애니메이션 출발점이다.
    //    ⛔ 움직임 줄이기면 즉시(접근성). setTimeout 으로 한 틱 뒤 제 비율로(숨은 탭에서도 타이머는 돈다).
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const [entered, setEntered] = useState(reduce);
    useEffect(() => {
        if (entered) return;
        const t = window.setTimeout(() => setEntered(true), 20);
        return () => window.clearTimeout(t);
    }, [entered]);
    const disp = entered ? node.sizes : growFromLast(node.sizes);
    return (
        <div ref={ref} className={`flex-1 min-w-0 min-h-0 flex ${isRow ? 'flex-row' : 'flex-col'}`}>
            {node.children.map((child, i) => (
                <div key={child.id} style={{ display: 'contents' }}>
                    <SplitChild basis={disp[i] ?? 0} dragging={dragging}>
                        <NodeView node={child} handlers={handlers} tabButtons={tabButtons} rootChrome={rootChrome} rootId={rootId} edges={edges} interaction={interaction} sidebar={sidebar} />
                    </SplitChild>
                    {i < node.children.length - 1 && (
                        <SplitHandle
                            dir={node.dir}
                            index={i}
                            sizes={node.sizes}
                            minA={mins[i] ?? 0}
                            minB={mins[i + 1] ?? 0}
                            containerRef={ref}
                            onResize={(s) => handlers.onResize(node.id, s)}
                            onDragging={setDragging}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

/** 「생길 때」 출발 비율 — 마지막 칸을 0 으로, 그 몫을 바로 앞 칸이 머금는다(새 칸이 밀고 들어오는 그림). */
function growFromLast(sizes: number[]): number[] {
    if (sizes.length < 2) return sizes;
    const out = [...sizes];
    const last = out.length - 1;
    out[last - 1] += out[last];
    out[last] = 0;
    return out;
}

/**
 * 스플릿 한 칸 — flex-basis 를 비율로 쥔다(③, 쥔님 2026-11-01).
 *   비율이 바뀌면 미끄러진다(.pane-btrans · 생길 때 출발 비율에서 제 비율로) — ⛔ 단 스플리터로 끄는 동안엔 꺼서 즉시 따라간다.
 */
function SplitChild({ basis, dragging, children }: { basis: number; dragging: boolean; children: React.ReactNode }) {
    return (
        <div
            className={`flex min-w-0 min-h-0 overflow-hidden ${dragging ? '' : 'pane-btrans'}`}
            style={{ flexBasis: `${basis * 100}%`, flexGrow: 0, flexShrink: 1 }}
        >
            {children}
        </div>
    );
}

function SplitHandle({
    dir, index, sizes, minA, minB, containerRef, onResize, onDragging,
}: {
    dir: 'row' | 'col';
    index: number;
    sizes: number[];
    /** 두 이웃 칸(index·index+1)의 활성 뷰 최소 px — 이 아래로는 안 줄어든다 */
    minA: number;
    minB: number;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onResize: (sizes: number[]) => void;
    /** 🔴 끄는 동안을 바깥(SplitView)에 알린다 — 그동안 칸 비율 transition 을 끈다(③) */
    onDragging?: (d: boolean) => void;
}) {
    const isRow = dir === 'row';
    const [dragging, setDragging] = useState(false);
    const start = useRef<{ pos: number; sizes: number[] } | null>(null);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        start.current = { pos: isRow ? e.clientX : e.clientY, sizes: [...sizes] };
        setDragging(true);
        onDragging?.(true);
    }, [isRow, sizes, onDragging]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const s = start.current;
        const el = containerRef.current;
        if (!s || !el) return;
        const rect = el.getBoundingClientRect();
        const total = isRow ? rect.width : rect.height;
        if (total <= 0) return;
        const d = ((isRow ? e.clientX : e.clientY) - s.pos) / total;
        const pair = s.sizes[index] + s.sizes[index + 1];
        // 🔴 px 최소폭을 비율로 환산해 두 칸 다 살린다(쥔님: 내용 뷰가 안 없어지게)
        const a = clampSplitPair(pair, s.sizes[index] + d, total, minA, minB, MIN_FRACTION);
        const next = [...s.sizes];
        next[index] = a;
        next[index + 1] = pair - a;
        onResize(next);
    }, [isRow, index, containerRef, onResize, minA, minB]);

    const end = useCallback(() => { start.current = null; setDragging(false); onDragging?.(false); }, [onDragging]);

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
                const a = clampSplitPair(pair, sizes[index] + dir2 * step, total, minA, minB, MIN_FRACTION);
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
