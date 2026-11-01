/**
 * 「프로젝트 탐색기」 패널 — VS Code 파일 탐색기 그림(쥔님 2026-11-01 17:28: *"VS 코드로 가자"*).
 *
 * 🔴 ⛔ 탐색기는 타입을 모른다 — 아이콘·컨테이너 여부·열기·「새로 만들기」 목록은 전부 등록 표(model/types.ts)에 묻는다.
 *    이 파일에 `type ===` 비교를 두지 않는다(설계 「여기서 죽는다」 — 탐색기가 타입을 알게 되는 유혹).
 * ⭐ 누르기(VS Code 식): 한 번 = 고르기만(폴더는 접기/펴기도) · 두 번·Enter = 열기 · F2 = 이름 바꾸기.
 * 🔴 드래그·우클릭은 useDragLeaf 한 훅으로 가른다(탭 드래그와 같은 가름 — 마우스 8px / 손가락 350ms 무장).
 *    떨굴 자리 셋(줄 위 25% 앞 · 아래 25% 뒤 · 가운데 50% 안으로 · container 일 때만) · accepts/자손 금지는 빨간 표시 +
 *    모델 move 가 마지막 관문. 좁은 화면(narrow)에선 드래그를 끄고 메뉴의 「위로·아래로」로.
 * ⭐ params.rootId 로 「이 폴더를 탐색기로」 탭을 그린다 — 루트가 지워졌으면 「없는 노드」 한 줄(유령 탭).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PluginHost, MenuEntry } from '../../../pane-ui-system/plugin';
import { usePluginRegistry } from '../../../pane-ui-system/plugin';
import { Icon, SectionHeader, IconButton, ContextMenu, useDragLeaf } from '../../../pane-ui-system';
import { flatten, filterIds, parentOf, isDescendant, type Tree } from '../model/tree';
import { isContainerType, iconOf, isKnownType, createCandidates, typeMenu, typeMenuByType, canOpenType, canDo, acceptsChild } from '../model/types';
import { clearDerived } from '../model/derive';
import { buildMainRows, type ExplorerRow } from './rows';
import { useExplorer, select, toggle, cancelRename, commitRename, moveNode, clearImportError } from '../store';

/** 들여쓰기 한 단(px) — 줄 높이는 토큰(--s-row)이 쥐고, 가로 들여쓰기만 여기서 센다. */
const INDENT = 12;
const BASE_PAD = 6;

/** 드래그가 떨어질 자리 — 포인터 DOM 자리를 「어느 줄·어느 띠」로 번역한 결과. */
interface DropResolved {
    targetId: string;
    pos: 'before' | 'after' | 'into';
    rect: DOMRect;
    destParent: string;
    index: number | undefined;
    ok: boolean;           // accepts 통과 + 제 자손 아님 (금지면 빨간 선)
}

/** 포인터 자리(x,y)를 떨굴 자리로 — 줄 높이 25/50/25 띠. DOM 을 더듬으니 순수 아님(drop-resolve 와 같은 결). */
function resolveDrop(container: HTMLElement | null, _x: number, y: number, dragId: string, tree: Tree): DropResolved | null {
    if (!container) return null;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]'));
    if (rows.length === 0) return null;
    let target: HTMLElement | null = null;
    for (const el of rows) {
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) { target = el; break; }
    }
    if (!target) target = y < rows[0].getBoundingClientRect().top ? rows[0] : rows[rows.length - 1];
    const rect = target.getBoundingClientRect();
    const targetId = target.getAttribute('data-row-id');
    if (!targetId) return null;
    const tnode = tree.nodes[targetId];
    if (!tnode) return null;

    const rel = rect.height > 0 ? (y - rect.top) / rect.height : 0.5;
    const isCont = isContainerType(tnode.type);
    const pos: 'before' | 'after' | 'into' = isCont
        ? (rel < 0.25 ? 'before' : rel > 0.75 ? 'after' : 'into')
        : (rel < 0.5 ? 'before' : 'after');

    let destParent: string;
    let index: number | undefined;
    if (pos === 'into') {
        destParent = targetId;
        index = undefined;
    } else {
        destParent = parentOf(tree, targetId) ?? tree.root;
        const sibs = tree.nodes[destParent].children.filter((c) => c !== dragId);
        const at = sibs.indexOf(targetId);
        index = pos === 'after' ? at + 1 : at;
    }
    const dnode = tree.nodes[dragId];
    const dp = tree.nodes[destParent];
    const ok = !!dnode && !!dp
        && destParent !== dragId
        && !isDescendant(tree, destParent, dragId)
        && acceptsChild(dp.type, dnode.type);
    return { targetId, pos, rect, destParent, index, ok };
}

export function ExplorerView({ host, rootId }: { host: PluginHost; rootId?: string }) {
    const { tree, selectedId, renamingId, purgeConfirmId, purgeAllConfirm, importError, loading } = useExplorer();
    const effRoot = rootId ?? tree.root;
    const rootMissing = rootId != null && !tree.nodes[rootId];

    const [query, setQuery] = useState('');
    const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
    const [narrow, setNarrow] = useState<boolean>(() => host.screen.narrow());
    const [trashOpen, setTrashOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const draggedRef = useRef(false);

    // 휴지통 줄(루트 밖) — 맨 아래 접이식 구역. 🔴 listRef(본 나무) 밖이라 드래그 떨굴 자리에 안 걸린다.
    const trashRows = flatten(tree, tree.trash, isContainerType);
    const run = (id: string) => host.commands.run(id);

    useEffect(() => {
        setNarrow(host.screen.narrow());
        const d = host.screen.on((n) => setNarrow(n));
        return () => d.dispose();
    }, [host]);

    // 🔴 플러그인이 켜지고/꺼질 때 다시 그린다(모르는 타입 회색·유도 자식 등장/소멸). 유도 캐시도 버린다.
    const reg = usePluginRegistry();
    useEffect(() => { clearDerived(); }, [reg]);

    const closeMenu = useCallback(() => setMenu(null), []);

    // ── 줄 목록 — 검색 중이면 실노드만(맞는 줄 + 조상, 접힘 무시) · 평소엔 유도 자식까지 섞은 빌더 ──
    const q = query.trim().toLowerCase();
    const rows: ExplorerRow[] = q
        ? flatten(tree, effRoot, isContainerType, {
            expandAll: true,
            keep: (() => { const k = filterIds(tree, effRoot, (n) => n.name.toLowerCase().includes(q)); return (id: string) => k.has(id); })(),
        }).map((r) => ({ kind: 'node' as const, id: r.id, depth: r.depth, node: r.node, hasChildren: r.hasChildren }))
        : buildMainRows(tree, effRoot);
    const selRow = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

    // ── 드래그 + 우클릭 한 훅 — 좁은 화면에선 끈다(그땐 메뉴의 위로/아래로) ──
    const onDrop = useCallback((dragId: string, x: number, y: number) => {
        draggedRef.current = true;
        if (isDescendant(tree, dragId, tree.trash)) return;          // 휴지통 줄은 드래그로 안 옮긴다
        const hit = resolveDrop(listRef.current, x, y, dragId, tree);
        if (hit && hit.ok) moveNode(dragId, hit.destParent, hit.index);
    }, [tree]);

    const onContext = useCallback((x: number, y: number, el: HTMLElement) => {
        const row = el.closest?.('[data-row-id]') as HTMLElement | null;
        select(row?.getAttribute('data-row-id') ?? null);
        setMenu({ x, y });
    }, []);

    const { bind, drag } = useDragLeaf({ enabled: !narrow, axis: 'y', onContext, onDrop });
    const preview = drag ? resolveDrop(listRef.current, drag.x, drag.y, drag.leafId, tree) : null;

    // ── 줄 하나 누르기 — 고르기(+ 실노드 컨테이너는 접기/펴기). 유도 줄은 고르기만. ──
    const clickRow = (row: ExplorerRow): void => {
        if (draggedRef.current) { draggedRef.current = false; return; }   // 방금 드래그 끝 — 클릭 삼킨다
        rootRef.current?.focus();                                        // 단축키(Ctrl+Z 등)가 뷰로 오게
        select(row.id);
        if (row.kind === 'node' && isContainerType(row.node.type)) toggle(row.id);
    };
    // 두 번 누르기 — 컨테이너는 아무 일 없음(접기는 한 번 누르기), openable 이면 열기 명령을 탄다(실노드·유도 공통).
    const dblRow = (row: ExplorerRow): void => {
        if (row.kind === 'node' && isContainerType(row.node.type)) return;
        select(row.id);
        run('project-explorer.open');
    };

    // ── 키보드 — ↑↓ 고르기 · →← 펴기/접기 또는 자식/부모 · Enter 열기 · F2 이름 · Delete 휴지통 ──
    const onKeyDown = (e: React.KeyboardEvent): void => {
        if (renamingId) return;
        const tgt = e.target as HTMLElement;
        if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') return;   // 검색칸·이름칸은 브라우저 undo 에 양보
        // 🔴 Ctrl/⌘+Z 되돌리기 · Ctrl/⌘+Shift+Z 다시하기 — 뷰에 포커스 있을 때만(전역 가로채기 금지)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            run(e.shiftKey ? 'project-explorer.redo' : 'project-explorer.undo');
            return;
        }
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
                    if (p && p !== effRoot) select(p);
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (sel) {
                    if (selNode && isContainerType(selNode.type)) toggle(sel);   // 컨테이너는 펴기/접기
                    else run('project-explorer.open');                          // openable·유도는 열기
                }
                break;
            case 'F2': e.preventDefault(); if (sel) host.commands.run('project-explorer.rename'); break;
            case 'Delete': case 'Backspace': e.preventDefault(); if (sel) host.commands.run('project-explorer.remove'); break;
        }
    };

    // ── 우클릭 메뉴 — 등록 표에서 「새로 만들기」를 짜고(⛔ 타입 비교 없음), 나머지 동작을 붙인다 ──
    const buildMenu = (): MenuEntry[] => {
        const selNode = selectedId ? tree.nodes[selectedId] : null;
        const inTrash = !!selectedId && isDescendant(tree, selectedId, tree.trash);
        // 휴지통 안 노드는 복원·영구삭제만(영구삭제는 인라인 확인으로 — ask-purge 가 줄을 바꾼다)
        if (selNode && inTrash) {
            return [
                { label: '복원', icon: 'undo', commandId: 'project-explorer.restore' },
                { label: '영구 삭제', icon: 'trash', danger: true, commandId: 'project-explorer.ask-purge' },
            ];
        }
        // 🔴 유도(가상) 줄 — 이름바꾸기·복제·삭제·드래그 전부 빠진다(저장 안 되는 줄). 열기·타입 menu 만.
        if (selRow && selRow.kind === 'virtual') {
            const vitems: MenuEntry[] = [];
            if (selRow.openable && selRow.vtype && canOpenType(selRow.vtype)) {
                vitems.push({ label: '열기', icon: 'arrowRight', commandId: 'project-explorer.open' });
            }
            const vextra = selRow.vtype ? typeMenuByType(selRow.vtype, selRow.id) : [];
            if (vextra.length) { if (vitems.length) vitems.push({ sep: true }); for (const it of vextra) vitems.push(it); }
            if (vitems.length === 0) vitems.push({ label: selRow.failed ? '유도 실패' : '유도 항목', disabled: true });
            return vitems;
        }
        // 「새로 만들기 ▸」 후보: 우클릭한 노드(없으면 보이는 루트)의 타입이 받는 것 ∩ create.under 허용
        const baseType = selNode ? selNode.type : (tree.nodes[effRoot]?.type ?? 'folder');
        const items: MenuEntry[] = [];
        // ContextMenu 는 하위 메뉴가 없다 → 「새 <label>」 로 평평하게(지금은 폴더 하나).
        for (const def of createCandidates(baseType)) {
            items.push({ label: `새 ${def.label}`, icon: 'plus', commandId: `project-explorer.new-${def.type}` });
        }
        if (selNode && !inTrash) {
            items.push({ label: '이름 바꾸기', icon: 'edit', commandId: 'project-explorer.rename', disabled: !canDo(selNode.type, 'rename') });
            items.push({ label: '복제', icon: 'copy', commandId: 'project-explorer.duplicate' });
            items.push({ label: '삭제', icon: 'trash', danger: true, commandId: 'project-explorer.remove', disabled: !canDo(selNode.type, 'delete') });
            items.push({ label: '내보내기(JSON)', icon: 'download', commandId: 'project-explorer.export-branch' });
            if (isContainerType(selNode.type)) {
                items.push({ label: '이 폴더를 탐색기로', icon: 'panelRight', commandId: 'project-explorer.open-as-root' });
            }
            if (narrow) {
                items.push({ label: '위로', icon: 'left', commandId: 'project-explorer.move-up' });
                items.push({ label: '아래로', icon: 'left', commandId: 'project-explorer.move-down' });
            }
            const extra = typeMenu(selNode, selNode.id);
            if (extra.length) { items.push({ sep: true }); for (const it of extra) items.push(it); }
        }
        if (items.length === 0) items.push({ label: '새 폴더', icon: 'plus', commandId: 'project-explorer.new-folder' });
        return items;
    };

    // 🔴 비동기 로드가 끝나기 전 — 줄·명령·키보드를 안 그린다(이 early return 이 조작을 막는 한쪽. 다른 쪽은
    //    store.apply 의 loading 가드). 빈 나무 위에 쌓인 뒤 저장돼 옛 나무를 덮는 사고를 막는 자리다.
    if (loading) {
        return (
            <div className="h-full flex flex-col bg-side">
                <SectionHeader title="프로젝트 탐색기" />
                <p className="px-pad py-3 text-[12px] text-muted select-none">불러오는 중…</p>
            </div>
        );
    }

    if (rootMissing) {
        return (
            <div className="h-full flex flex-col bg-side">
                <SectionHeader title="프로젝트 탐색기" />
                <p className="px-pad py-3 text-[12px] text-muted select-none">없는 노드 — 이 폴더는 지워졌습니다.</p>
            </div>
        );
    }

    return (
        <div
            ref={rootRef}
            className="h-full flex flex-col bg-side outline-none"
            style={drag && preview && !preview.ok ? { cursor: 'not-allowed' } : undefined}
            tabIndex={0}
            role="tree"
            onKeyDown={onKeyDown}
            {...bind}
        >
            <SectionHeader
                title="프로젝트 탐색기"
                end={(
                    <>
                        <IconButton icon="plus" label="새 폴더" onClick={() => host.commands.run('project-explorer.new-folder')} />
                        <IconButton icon="upload" label="들여오기(JSON)" onClick={() => host.commands.run('project-explorer.import-branch')} />
                        <IconButton icon="left" label="모두 접기" onClick={() => host.commands.run('project-explorer.collapse-all')} />
                    </>
                )}
            />

            {/* 들여오기 실패 한 줄 — 모양 틀린 파일 등. 눌러 닫는다(⛔ alert 안 씀) */}
            {importError && (
                <div className="flex items-center gap-1 px-pad py-1 border-b border-line shrink-0 text-[12px] text-bad">
                    <Icon name="warn" size={13} className="shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{importError}</span>
                    <IconButton icon="x" label="닫기" size={13} onClick={() => clearImportError()} />
                </div>
            )}

            {/* 검색 — 맞는 줄과 그 조상만(접힘 무시) · 비우면 원래대로 */}
            <div className="flex items-center gap-1 px-pad py-1 border-b border-line shrink-0">
                <Icon name="search" size={13} className="text-muted shrink-0" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="검색"
                    className="flex-1 min-w-0 text-[12px] leading-none bg-transparent text-text placeholder:text-muted outline-none"
                />
                {query && <IconButton icon="x" label="검색 지우기" size={13} onClick={() => setQuery('')} />}
            </div>

            <div ref={listRef} className="flex-1 min-h-0 overflow-auto py-1 relative">
                {rows.length === 0 && (
                    <p className="px-pad py-2 text-[12px] text-muted select-none">
                        {q ? '맞는 항목이 없습니다.' : '비어 있습니다 — 「새 폴더」로 시작하세요.'}
                    </p>
                )}
                {rows.map((row) => {
                    const isSel = selectedId === row.id;
                    const isInto = !!preview && preview.pos === 'into' && preview.targetId === row.id;

                    // 🔴 유도(가상) 줄 — 회색 글자, 이름바꾸기·드래그 없음(data-row-id 는 둬 드롭에서 자동 거부된다).
                    if (row.kind === 'virtual') {
                        return (
                            <div
                                key={row.id}
                                data-row-id={row.id}
                                role="treeitem"
                                aria-selected={isSel}
                                title={row.name}
                                onClick={() => clickRow(row)}
                                onDoubleClick={() => dblRow(row)}
                                className={`flex items-center gap-1 h-row pr-2 cursor-pointer select-none transition-colors ${
                                    isSel ? 'bg-accent/15' : 'hover:bg-text/[0.04]'
                                }`}
                                style={{ paddingLeft: row.depth * INDENT + BASE_PAD }}
                            >
                                {row.hasChildren ? (
                                    <span className="shrink-0 grid place-items-center w-4 h-4 text-muted">
                                        <Icon name="right" size={12} className="rotate-90" />
                                    </span>
                                ) : (
                                    <span className="shrink-0 w-4" />
                                )}
                                <Icon name={row.icon ?? 'dot'} size={15} className="shrink-0 text-muted" />
                                <span className="flex-1 min-w-0 truncate text-[13px] leading-none text-muted italic">
                                    {row.name}
                                </span>
                            </div>
                        );
                    }

                    const known = isKnownType(row.node.type);
                    const isRenaming = renamingId === row.id;
                    return (
                        <div
                            key={row.id}
                            data-row-id={row.id}
                            role="treeitem"
                            aria-selected={isSel}
                            aria-expanded={row.hasChildren ? !row.node.collapsed : undefined}
                            title={row.node.name}
                            onClick={() => clickRow(row)}
                            onDoubleClick={() => dblRow(row)}
                            className={`group flex items-center gap-1 h-row pr-2 cursor-pointer select-none transition-colors ${
                                isSel ? 'bg-accent/15' : 'hover:bg-text/[0.04]'
                            } ${isInto ? (preview!.ok ? 'ring-1 ring-inset ring-accent' : 'ring-1 ring-inset ring-bad') : ''}`}
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

            {/* 🗑 휴지통 — 맨 아래 접이식. 안의 줄은 회색. 영구삭제·비우기는 인라인 확인(⛔ window.confirm 안 씀) */}
            <div className="shrink-0 border-t border-line">
                <div className="flex items-center gap-1 h-row px-pad select-none">
                    <button
                        type="button"
                        onClick={() => setTrashOpen((v) => !v)}
                        className="flex items-center gap-1 flex-1 min-w-0 text-[12px] text-muted hover:text-text transition-colors"
                    >
                        <Icon name="right" size={11} className={`shrink-0 transition-transform ${trashOpen ? 'rotate-90' : ''}`} />
                        <Icon name="trash" size={13} className="shrink-0" />
                        <span className="truncate">휴지통 ({trashRows.length})</span>
                    </button>
                    {trashRows.length > 0 && (
                        purgeAllConfirm ? (
                            <span className="flex items-center gap-1 text-[11px]">
                                <span className="text-muted">비울까요?</span>
                                <button type="button" onClick={() => run('project-explorer.purge-all')} className="px-1 rounded text-bad hover:bg-bad/10">비우기</button>
                                <button type="button" onClick={() => run('project-explorer.cancel-purge')} className="px-1 rounded text-muted hover:bg-text/[0.06]">취소</button>
                            </span>
                        ) : (
                            <IconButton icon="trash" label="휴지통 비우기" size={13} onClick={() => run('project-explorer.ask-purge-all')} />
                        )
                    )}
                </div>

                {trashOpen && (
                    <div className="max-h-[40%] overflow-auto pb-1">
                        {trashRows.length === 0 && (
                            <p className="px-pad py-1 text-[12px] text-muted select-none">휴지통이 비어 있습니다.</p>
                        )}
                        {trashRows.map((row) => {
                            const isSel = selectedId === row.id;
                            const confirming = purgeConfirmId === row.id;
                            return (
                                <div
                                    key={row.id}
                                    data-row-id={row.id}
                                    role="treeitem"
                                    aria-selected={isSel}
                                    title={row.node.name}
                                    onClick={() => { rootRef.current?.focus(); select(row.id); if (isContainerType(row.node.type)) toggle(row.id); }}
                                    className={`flex items-center gap-1 h-row pr-2 cursor-pointer select-none transition-colors ${
                                        isSel ? 'bg-accent/15' : 'hover:bg-text/[0.04]'
                                    }`}
                                    style={{ paddingLeft: row.depth * INDENT + BASE_PAD + 14 }}
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
                                    <Icon name={iconOf(row.node)} size={15} className="shrink-0 text-muted" />
                                    {confirming ? (
                                        <span className="flex items-center gap-1 flex-1 min-w-0 text-[11px]">
                                            <span className="text-muted truncate">정말 지울까요?</span>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); run('project-explorer.purge'); }} className="px-1 rounded text-bad hover:bg-bad/10">지우기</button>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); run('project-explorer.cancel-purge'); }} className="px-1 rounded text-muted hover:bg-text/[0.06]">취소</button>
                                        </span>
                                    ) : (
                                        <span className="flex-1 min-w-0 truncate text-[13px] leading-none text-muted">{row.node.name}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 드래그 떨굴 선 — before/after 는 가로선, 금지면 빨강(토큰 색만). into 는 줄 자체에 ring 으로 그린다 */}
            {drag && preview && preview.pos !== 'into' && (
                <div
                    className={`fixed z-[150] h-0.5 pointer-events-none ${preview.ok ? 'bg-accent' : 'bg-bad'}`}
                    style={{
                        left: preview.rect.left,
                        width: preview.rect.width,
                        top: preview.pos === 'before' ? preview.rect.top : preview.rect.bottom,
                    }}
                />
            )}

            {menu && (
                <ContextMenu
                    x={menu.x}
                    y={menu.y}
                    items={buildMenu()}
                    onClose={closeMenu}
                    onCommand={(id) => host.commands.run(id)}
                />
            )}
        </div>
    );
}
