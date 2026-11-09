/**
 * nodes.Frame — 모든 노드 화면(탭)과 옆으로 열기(피크)의 겉틀 하나(Q5 R1·R3).
 *   구조: 상단 줄(‹ 위로 · 조상 경로 · 액션바 · ⋯ 메뉴) → 큰 머리(nodes.Header page 꼴 — 머리 모양은 이것 하나) → 툴바 자리 → 본문.
 *   🔑 상단 줄은 모든 노드가 같은 꼴이고, 툴바는 본문 종류마다 다르다 — 같은 동작은 한 줄에만(페이지 전체 동작은 ⋯ 로).
 *   🔑 피크 안이면 상단 줄을 피크 머리줄 자리(usePeekBar)에 그린다 — 줄이 둘이 안 된다.
 *   ⋯ 메뉴 = 본문이 보탠 항목 + 공통(이름 바꾸기·탐색기에서 보기·휴지통으로) + 그 타입의 menu. 우클릭 메뉴(Q6)도 같은 항목을 쓴다.
 */
import { Fragment, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, ConfirmDialog, ContextMenu, Icon, IconButton, usePeekBar, useContextTrigger, type MenuEntry } from '../../../pane-ui-system';
import { runCommand } from '../../../pane-ui-system/plugin';
import type { NodeFrameProps } from '../contracts/nodes';
import { parentOf } from '../model/tree';
import type { Node } from '../model/tree';
import { canDo, canOpenType, confirmDeleteMsg, iconOf, typeMenu } from '../model/types';
import { getState, openById, select as selectNode, subscribeState, trashNode } from '../store';
import { NodeHeader } from './NodeHeader';

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

/** ⋯ 메뉴 항목 — 본문이 보탠 것 · 공통 · 타입 menu. 누를 때 짓는다(타입 menu 가 부르는 순간 대상을 잡아 두기 때문). */
export function frameMenu(nodeId: string, extra: MenuEntry[] | undefined, ops: { rename: () => void; ask: () => void }): MenuEntry[] {
    const node = getState().tree.nodes[nodeId];
    if (!node) return [];
    const out: MenuEntry[] = [];
    if (extra?.length) out.push(...extra, { sep: true });
    out.push({ label: '이름 바꾸기', icon: 'edit', disabled: !canDo(node.type, nodeId, 'rename'), onClick: ops.rename });
    out.push({ label: '탐색기에서 보기', icon: 'folder', onClick: () => selectNode(nodeId) });
    const typed = typeMenu(node, nodeId);
    if (typed.length) out.push({ sep: true }, ...typed);
    out.push({ sep: true }, { label: '휴지통으로', icon: 'trash', danger: true, disabled: !canDo(node.type, nodeId, 'delete'), onClick: ops.ask });
    return out;
}

const EDITABLE = 'input, textarea, [contenteditable="true"], [contenteditable=""]';

export function NodeFrame({
    nodeId, leafId, onBack, backLabel = '목록', actions, menu, toolbar, headerExtra, width = 'full', scroll = false,
    fallback, titleAriaLabel = '제목', titlePlaceholder = '제목 없음', onTitleEnter, onRename, children,
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
            {onBack && (
                <Button size="sm" variant="plain" className="shrink-0 whitespace-nowrap inline-flex items-center gap-1" title={backLabel} onClick={onBack}>
                    <Icon name="left" size={12} /> {backLabel}
                </Button>
            )}
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
    const header: ReactNode = (
        <div className="flex items-end gap-3 min-w-0">
            <NodeHeader nodeId={nodeId} leafId={leafId} fallback={fallback ?? <Icon name={iconOf(node)} size={30} className="text-muted" />}
                titleAriaLabel={titleAriaLabel} titlePlaceholder={titlePlaceholder} onTitleEnter={onTitleEnter} onRename={onRename} />
            {headerExtra && <div className="shrink-0 pb-1 text-small text-muted tabular-nums">{headerExtra}</div>}
        </div>
    );

    const col = COLUMN[width];
    let body: ReactNode;
    if (typeof children === 'function') {
        body = <div className="flex-1 min-h-0">{children(header)}</div>;
    } else if (scroll) {
        body = (
            <div className="flex-1 min-h-0 overflow-auto">
                <div className={`${col} px-6 pt-6 pb-16`}>
                    <div className="mb-4">{header}</div>
                    {toolbar}
                    {children}
                </div>
            </div>
        );
    } else {
        body = (
            <>
                <div className={`shrink-0 ${col} px-6 pt-4 pb-2`}>{header}</div>
                {toolbar && <div className={`shrink-0 ${col}`}>{toolbar}</div>}
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
            {pop && <ContextMenu x={pop.x} y={pop.y} items={pop.items} onClose={() => setPop(null)} onCommand={(id) => { runCommand(id); }} />}
            {ask && (
                <ConfirmDialog title="휴지통으로 옮길까요?" danger confirmLabel="휴지통으로" onCancel={() => setAsk(null)}
                    onConfirm={() => { setAsk(null); trashNode(nodeId); }}>
                    {ask}
                </ConfirmDialog>
            )}
        </div>
    );
}
