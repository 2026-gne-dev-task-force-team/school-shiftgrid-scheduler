/**
 * 「프로젝트 탐색기」 패널 — VS Code 파일 탐색기 그림(쥔님 2026-11-01 17:28: *"VS 코드로 가자"*).
 *
 * 🔴 ⛔ 탐색기는 타입을 모른다 — 아이콘·컨테이너 여부·열기는 전부 등록 표(model/types.ts)에 묻는다.
 *    이 파일에 `type ===` 비교를 두지 않는다(설계 「여기서 죽는다」 — 탐색기가 타입을 알게 되는 유혹).
 * ⭐ 누르기(VS Code 식): 한 번 = 고르기만(폴더는 접기/펴기도) · 두 번·Enter = 열기(N1 폴더는 접기/펴기와 같다 ·
 *    openable 타입이 오면 open 을 부를 자리만 둔다) · F2 = 이름 바꾸기.
 * 🔴 이름 바꾸기 input 에서 한글 조합 중 Enter 는 무시한다(isComposing || keyCode 229) — 설계 「각 판에서 죽는 방식」 N1.
 */
import { useCallback, useState } from 'react';
import type { PluginHost, MenuEntry } from '../../../pane-ui-system/plugin';
import { Icon, SectionHeader, IconButton, ContextMenu, useContextTrigger } from '../../../pane-ui-system';
import { flatten, parentOf, type Node } from '../model/tree';
import { isContainerType, iconOf, isKnownType, getType } from '../model/types';
import { useExplorer, select, toggle, cancelRename, commitRename } from '../store';

/** 들여쓰기 한 단(px) — 줄 높이는 토큰(--s-row)이 쥐고, 가로 들여쓰기만 여기서 센다. */
const INDENT = 12;
const BASE_PAD = 6;

export function ExplorerView({ host }: { host: PluginHost }) {
    const { tree, selectedId, renamingId } = useExplorer();
    const rows = flatten(tree, tree.root, isContainerType);
    const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
    const closeMenu = useCallback(() => setMenu(null), []);

    // 🔴 「무엇이 우클릭인가」는 useContextTrigger 한 곳에만 — 눌린 줄은 data-row-id 로 더듬는다(EmptyArea 와 같은 결).
    const trigger = useContextTrigger((x, y, e) => {
        const el = (e.target as HTMLElement | null)?.closest?.('[data-row-id]') as HTMLElement | null;
        select(el?.getAttribute('data-row-id') ?? null);
        setMenu({ x, y });
    });

    // ── 노드 하나를 「연다」 — 폴더는 접기/펴기, openable 타입은 등록된 open ──
    const openNode = (id: string): void => {
        const n = tree.nodes[id];
        if (!n) return;
        if (isContainerType(n.type)) { toggle(id); return; }
        const def = getType(n.type);
        if (def?.openable && def.open) def.open(id);   // N1 엔 openable 타입이 없다 — 자리만
    };

    const clickRow = (n: Node): void => {
        select(n.id);
        if (isContainerType(n.type)) toggle(n.id);   // 폴더는 한 번 눌러도 접기/펴기
    };
    const dblRow = (n: Node): void => {
        if (isContainerType(n.type)) return;         // 폴더는 clickRow 가 이미 토글했다(이중 토글 방지)
        openNode(n.id);
    };

    // ── 키보드 — ↑↓ 고르기 · →← 펴기/접기 또는 자식/부모 · Enter 열기 · F2 이름 · Delete 휴지통 ──
    const onKeyDown = (e: React.KeyboardEvent): void => {
        if (renamingId) return;                       // input 이 제 키를 쥔다
        const sel = selectedId;
        const selNode = sel ? tree.nodes[sel] : null;
        const idx = rows.findIndex((r) => r.id === sel);
        const selectRow = (i: number): void => { const r = rows[i]; if (r) select(r.id); };
        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); selectRow(idx < 0 ? 0 : Math.min(rows.length - 1, idx + 1)); break;
            case 'ArrowUp': e.preventDefault(); selectRow(idx < 0 ? rows.length - 1 : Math.max(0, idx - 1)); break;
            case 'ArrowRight':
                e.preventDefault();
                if (selNode && isContainerType(selNode.type)) {
                    if (selNode.collapsed) toggle(sel!);
                    else if (selNode.children[0]) select(selNode.children[0]);
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (selNode && isContainerType(selNode.type) && !selNode.collapsed && selNode.children.length) {
                    toggle(sel!);
                } else if (sel) {
                    const p = parentOf(tree, sel);
                    if (p && p !== tree.root) select(p);
                }
                break;
            case 'Enter': e.preventDefault(); if (sel) openNode(sel); break;
            // 🔴 F2·Delete 도 명령을 거친다(「모든 동작은 명령」) — 대상은 스토어의 고른 노드.
            case 'F2': e.preventDefault(); if (sel) host.commands.run('project-explorer.rename'); break;
            case 'Delete': case 'Backspace': e.preventDefault(); if (sel) host.commands.run('project-explorer.remove'); break;
        }
    };

    const menuItems: MenuEntry[] = [
        { label: '새 폴더', icon: 'plus', commandId: 'project-explorer.new-folder' },
        { label: '이름 바꾸기', icon: 'edit', commandId: 'project-explorer.rename', disabled: !selectedId },
        { sep: true },
        { label: '삭제', icon: 'trash', danger: true, commandId: 'project-explorer.remove', disabled: !selectedId },
    ];

    return (
        <div
            className="h-full flex flex-col bg-side outline-none"
            tabIndex={0}
            role="tree"
            onKeyDown={onKeyDown}
            {...trigger}
        >
            <SectionHeader
                title="프로젝트 탐색기"
                end={(
                    <>
                        <IconButton icon="plus" label="새 폴더" onClick={() => host.commands.run('project-explorer.new-folder')} />
                        <IconButton icon="left" label="모두 접기" onClick={() => host.commands.run('project-explorer.collapse-all')} />
                    </>
                )}
            />

            <div className="flex-1 min-h-0 overflow-auto py-1">
                {rows.length === 0 && (
                    <p className="px-pad py-2 text-[12px] text-muted select-none">비어 있습니다 — 「새 폴더」로 시작하세요.</p>
                )}
                {rows.map((row) => {
                    const known = isKnownType(row.node.type);
                    const isSel = selectedId === row.id;
                    const isRenaming = renamingId === row.id;
                    return (
                        <div
                            key={row.id}
                            data-row-id={row.id}
                            role="treeitem"
                            aria-selected={isSel}
                            aria-expanded={row.hasChildren ? !row.node.collapsed : undefined}
                            title={row.node.name}
                            onClick={() => clickRow(row.node)}
                            onDoubleClick={() => dblRow(row.node)}
                            className={`group flex items-center gap-1 h-row pr-2 cursor-pointer select-none transition-colors ${
                                isSel ? 'bg-accent/15' : 'hover:bg-text/[0.04]'
                            }`}
                            style={{ paddingLeft: row.depth * INDENT + BASE_PAD }}
                        >
                            {row.hasChildren ? (
                                <span
                                    role="button"
                                    aria-label={row.node.collapsed ? '펴기' : '접기'}
                                    onClick={(e) => { e.stopPropagation(); select(row.id); toggle(row.id); }}
                                    className="shrink-0 grid place-items-center w-4 h-4 text-muted"
                                >
                                    <Icon name="right" size={12} className={`transition-transform ${row.node.collapsed ? '' : 'rotate-90'}`} />
                                </span>
                            ) : (
                                <span className="shrink-0 w-4" />
                            )}

                            <Icon name={iconOf(row.node)} size={15} className={`shrink-0 ${known ? '' : 'text-muted'}`} />

                            {isRenaming ? (
                                <input
                                    autoFocus
                                    defaultValue={row.node.name}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onBlur={(e) => commitRename(e.currentTarget.value)}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') {
                                            // 🔴 한글 조합 중 Enter 는 무시(사파리는 keyCode 229 만 온다)
                                            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                                            commitRename(e.currentTarget.value);
                                        } else if (e.key === 'Escape') {
                                            cancelRename();
                                        }
                                    }}
                                    className="flex-1 min-w-0 text-[13px] leading-none bg-bg text-text border border-accent rounded px-1 py-0.5 outline-none"
                                />
                            ) : (
                                <span className={`flex-1 min-w-0 truncate text-[13px] leading-none ${known ? 'text-text' : 'text-muted'}`}>
                                    {row.node.name}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {menu && (
                <ContextMenu
                    x={menu.x}
                    y={menu.y}
                    items={menuItems}
                    onClose={closeMenu}
                    onCommand={(id) => host.commands.run(id)}
                />
            )}
        </div>
    );
}
