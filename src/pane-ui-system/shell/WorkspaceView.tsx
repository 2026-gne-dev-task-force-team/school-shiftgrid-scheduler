/**
 * 트리 그리기 — 한 Node 를 재귀로 그린다.
 *   split → 자식들을 비율대로 나란히 + 칸 사이 스플리터
 *   tabs  → 탭 줄(Tabs) + 활성 leaf 몸통(EditorArea)
 *
 * 🔴 좁은 화면(narrow)에서는 split 을 안 그린다 — flatten() 으로 모든 leaf 를 펴서 탭 하나로 본다.
 *    ⛔ 모델은 그대로 둔다(그림만 다르다). 넓은 화면으로 돌아가면 가른 배치가 살아 있다.
 * 🔴 색·px 는 토큰 클래스로만(구조 검사 ①). 손잡이는 pointer 이벤트(터치 됨).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Node, Leaf } from '../layout/tree';
import { flatten, MIN_FRACTION } from '../layout/tree';
import { getView } from '../view-registry';
import { Tabs, type TabItem } from './Tabs';
import { EditorArea } from './EditorArea';

export interface WorkspaceHandlers {
    onActivate: (leafId: string) => void;
    onClose: (leafId: string) => void;
    onSplit: (tabsId: string, dir: 'row' | 'col') => void;
    onResize: (splitId: string, sizes: number[]) => void;
    onAddToTabs: (tabsId: string) => void;
    /** 좁은 화면 탭 줄의 + — 가운데에 새 탭 */
    onAddGlobal: () => void;
}

interface NarrowBar {
    onOpenLeft?: () => void;
    onOpenRight?: () => void;
    onOpenSettings?: () => void;
}

function toItems(leaves: Leaf[]): TabItem[] {
    return leaves.map((l) => ({ id: l.id, title: l.title, icon: getView(l.viewId)?.icon }));
}

export function WorkspaceView({
    node, narrow, activeLeafId, handlers, narrowBar,
}: {
    node: Node;
    narrow: boolean;
    /** 좁은 화면에서 어느 leaf 를 볼지(넓은 화면에선 각 tabs 의 activeId 를 쓴다) */
    activeLeafId?: string | null;
    handlers: WorkspaceHandlers;
    narrowBar?: NarrowBar;
}) {
    if (narrow) {
        // 전부 펴서 탭 하나로 — split 은 안 그린다
        const leaves = flatten(node);
        const active = leaves.some((l) => l.id === activeLeafId) ? activeLeafId! : (leaves[0]?.id ?? null);
        const activeLeaf = leaves.find((l) => l.id === active) ?? null;
        return (
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                <Tabs
                    tabs={toItems(leaves)}
                    activeId={active}
                    onSelect={handlers.onActivate}
                    onClose={handlers.onClose}
                    onAdd={handlers.onAddGlobal}
                    narrow
                    onOpenLeft={narrowBar?.onOpenLeft}
                    onOpenRight={narrowBar?.onOpenRight}
                    onOpenSettings={narrowBar?.onOpenSettings}
                />
                <EditorArea leaf={activeLeaf} />
            </div>
        );
    }
    // ⭐ 사이드바 토글은 "루트" 탭 줄에만 붙인다 — 중첩된 탭 줄마다 붙으면 같은 단추가 여럿이 된다.
    //    ⚠️ 루트가 split 이면 붙을 데가 없다 — 그때는 스플리터 두 번 누르기·접힌 레일 단추로 연다.
    //    상단 액션 바가 생기면 이 단추는 거기로 옮긴다.
    return <NodeView node={node} handlers={handlers} bar={narrowBar} />;
}

function NodeView({ node, handlers, bar }: { node: Node; handlers: WorkspaceHandlers; bar?: NarrowBar }) {
    if (node.kind === 'leaf') {
        // 불변식상 맨몸 leaf 는 안 오지만, 방어적으로 그린다
        return <EditorArea leaf={node} />;
    }
    if (node.kind === 'tabs') {
        const activeLeaf = node.children.find((c) => c.id === node.activeId) ?? null;
        return (
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                <Tabs
                    tabs={toItems(node.children)}
                    activeId={node.activeId || null}
                    onSelect={handlers.onActivate}
                    onClose={handlers.onClose}
                    onAdd={() => handlers.onAddToTabs(node.id)}
                    onSplit={() => handlers.onSplit(node.id, 'row')}
                    onOpenLeft={bar?.onOpenLeft}
                    onOpenRight={bar?.onOpenRight}
                />
                <EditorArea leaf={activeLeaf} />
            </div>
        );
    }
    return <SplitView node={node} handlers={handlers} />;
}

function SplitView({ node, handlers }: { node: Extract<Node, { kind: 'split' }>; handlers: WorkspaceHandlers }) {
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
                        <NodeView node={child} handlers={handlers} />
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
