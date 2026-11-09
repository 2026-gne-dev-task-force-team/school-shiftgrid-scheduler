/**
 * nodes.Frame — 모든 노드 화면(탭)과 옆으로 열기(피크)의 겉틀 하나(Q5 R1·R3).
 *   구조: 상단 줄(조상 경로 · 액션바 · ⋯ 메뉴) → 큰 머리(nodes.Header page 꼴 — 머리 모양은 이것 하나) → 툴바 자리 → 본문.
 *   🔑 상단 줄은 모든 노드가 같은 꼴이고, 툴바는 본문 종류마다 다르다 — 같은 동작은 한 줄에만(페이지 전체 동작은 ⋯ 로).
 *   🔑 피크 안이면 상단 줄을 피크 머리줄 자리(usePeekBar)에 그린다 — 줄이 둘이 안 된다.
 *   ⋯ 메뉴 = 본문이 보탠 항목 + 공통(이름 바꾸기·탐색기에서 보기·휴지통으로) + 그 타입의 menu. 우클릭 메뉴(Q6)도 같은 항목을 쓴다.
 */
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, ContextMenu, Icon, IconButton, usePeekBar, useContextTrigger, type MenuEntry } from '../../../pane-ui-system';
import { runCommand } from '../../../pane-ui-system/plugin';
import type { NodeFrameProps } from '../contracts/nodes';
import { parentOf } from '../model/tree';
import type { Node } from '../model/tree';
import { canOpenType, confirmDeleteMsg, iconOf } from '../model/types';
import { getState, openById, select as selectNode, subscribeState, trashNode } from '../store';
import { NodeHeader } from './NodeHeader';
import { nodeMenu } from './node-menu';
import { bindLeafNode } from '../leaf-follow';
import { TrashConfirm } from './TrashConfirm';

const COLUMN = { full: 'w-full', page: 'mx-auto w-full max-w-3xl', wide: 'mx-auto w-full max-w-4xl' } as const;

/** 조상 노드들(가까운 부모가 맨 뒤) — 루트·휴지통 줄기는 뺀다. */
function ancestorsOf(tree: ReturnType<typeof getState>['tree'], id: string): Node[] {
    const out: Node[] = [];
    let p = parentOf(tree, id);
    while (p && p !== tree.root) {
        const n = tree.nodes[p];
        if (!n || n.id === tree.trash) break;
        out.unshift(n);
        p = parentOf(tree, p);
    }
    return out;
}

/** ⋯ 메뉴 항목 — 본문이 보탠 것 + 탐색기 우클릭과 같은 한 목록(node-menu). 누를 때 짓는다(타입 menu 가 부르는 순간 대상을 잡아 두기 때문). */
export function frameMenu(nodeId: string, extra: MenuEntry[] | undefined, ops: { rename: () => void; ask: () => void }): MenuEntry[] {
    return nodeMenu(nodeId, {
        extra, move: true,
        rename: { run: ops.rename },
        reveal: () => selectNode(nodeId),
        remove: { run: ops.ask },
    });
}

const EDITABLE = 'input, textarea, [contenteditable="true"], [contenteditable=""]';

export function NodeFrame({
    nodeId, leafId, actions, menu, toolbar, headerExtra, width = 'full', scroll = false,
    titleAriaLabel = '제목', titlePlaceholder = '제목 없음', onTitleEnter, onRename, children,
}: NodeFrameProps) {
    const tree = useSyncExternalStore(subscribeState, () => getState().tree);
    const slot = usePeekBar();
    const [pop, setPop] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);
    const [ask, setAsk] = useState<string | null>(null);
    const root = useRef<HTMLDivElement>(null);
    const node = tree.nodes[nodeId];
    // R6: 틀의 빈 곳 우클릭 = ⋯ 메뉴와 같은 항목(안쪽 화면이 제 메뉴를 먼저 열었으면 그쪽이 이긴다)
    const trigger = useContextTrigger((x, y) => {
        setPop({ x, y, items: frameMenu(nodeId, menu, { rename: focusTitle, ask: askTrash }) });
    }, (t) => !!t.closest(EDITABLE));
    // 🔑 이 탭이 이 노드를 보고 있다고 적고 고른다 — 탐색기 강조·속성 패널이 따라온다(피크는 leafId 가 없어 안 건드린다)
    useEffect(() => bindLeafNode(leafId, nodeId), [leafId, nodeId]);
    if (!node) return null;

    const focusTitle = () => {
        const el = Array.from(root.current?.querySelectorAll<HTMLInputElement>('input') ?? []).find((i) => i.getAttribute('aria-label') === titleAriaLabel);
        el?.focus(); el?.select();
    };
    const askTrash = () => {
        const msg = confirmDeleteMsg(node.type, nodeId);
        if (msg) setAsk(msg); else trashNode(nodeId);
    };
    const openMenu = (e: React.MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPop({ x: r.left, y: r.bottom + 4, items: frameMenu(nodeId, menu, { rename: focusTitle, ask: askTrash }) });
    };
    const goto = (a: Node) => { if (canOpenType(a.type)) openById(a.id); else selectNode(a.id); };
    const anc = ancestorsOf(tree, nodeId);

    const bar = (
        <>
            <nav aria-label="경로" className="min-w-0 flex-1 flex items-center gap-0.5 overflow-hidden text-small text-muted">
                {anc.map((a, i) => (
                    <Fragment key={a.id}>
                        {i > 0 && <span className="shrink-0">/</span>}
                        <Button size="sm" variant="plain" className="min-w-0 truncate whitespace-nowrap text-muted" title={a.name} onClick={() => goto(a)}>{a.name}</Button>
                    </Fragment>
                ))}
            </nav>
            {actions}
            <IconButton icon="dots" label="더보기" onClick={openMenu} />
        </>
    );
    // 🔑 머리는 모든 노드가 한 꼴 — 아이콘(그 타입 자신의 것 22px)+제목 한 줄. 높이(h-10)·아래 여백(pb-2)을 여기서만 정한다.
    //    ⛔ 호출자가 fallback 아이콘을 따로 주던 길은 닫았다(꾸러미마다 크기·모양이 달라 머리가 들쭉날쭉했다) — 탐색기와 같은 아이콘.
    const header: ReactNode = (
        <div data-nf-header className="flex items-center gap-3 w-full min-w-0 pb-2">
            <NodeHeader nodeId={nodeId} leafId={leafId} fallback={<Icon name={iconOf(node)} size={22} className="text-muted" />}
                titleAriaLabel={titleAriaLabel} titlePlaceholder={titlePlaceholder} onTitleEnter={onTitleEnter} onRename={onRename} />
            {headerExtra && <div className="shrink-0 text-small text-muted tabular-nums">{headerExtra}</div>}
        </div>
    );

    const col = COLUMN[width];
    // 머리 자리(위 여백 pt-3 · 옆 px-6 · 폭 col) — 고정이든 스크롤 안이든 같은 상자를 쓴다.
    const headBox = `${col} px-6 pt-3`;
    let body: ReactNode;
    if (typeof children === 'function') {
        body = <div className="flex-1 min-h-0">{children(header)}</div>;
    } else if (scroll && !toolbar) {
        body = (
            <div className="flex-1 min-h-0 overflow-auto">
                <div className={`${headBox} pb-16`}>
                    {header}
                    {children}
                </div>
            </div>
        );
    } else if (scroll) {
        // 툴바는 스크롤 밖(머리 바로 아래 고정) — 본문만 스크롤된다(W6).
        body = (
            <>
                <div data-slot="head" className={`shrink-0 ${headBox}`}>{header}</div>
                <div data-slot="toolbar" className={`shrink-0 ${col}`}>{toolbar}</div>
                <div className="flex-1 min-h-0 overflow-auto">
                    <div className={`${col} px-6 pt-3 pb-16`}>{children}</div>
                </div>
            </>
        );
    } else {
        body = (
            <>
                <div data-slot="head" className={`shrink-0 ${headBox}`}>{header}</div>
                {toolbar && <div data-slot="toolbar" className={`shrink-0 ${col}`}>{toolbar}</div>}
                <div className="flex-1 min-h-0">{children}</div>
            </>
        );
    }

    return (
        <div ref={root} className="h-full flex flex-col min-h-0" data-nf={nodeId} {...trigger}>
            {slot
                ? createPortal(bar, slot)
                : <div className="shrink-0 flex items-center gap-1 h-header px-pad border-b border-line select-none">{bar}</div>}
            {body}
            {pop && <ContextMenu x={pop.x} y={pop.y} items={pop.items} onClose={() => setPop(null)} onCommand={(id, arg) => { runCommand(id, arg); }} />}
            {ask && <TrashConfirm msg={ask} onCancel={() => setAsk(null)} onConfirm={() => { setAsk(null); trashNode(nodeId); }} />}
        </div>
    );
}
