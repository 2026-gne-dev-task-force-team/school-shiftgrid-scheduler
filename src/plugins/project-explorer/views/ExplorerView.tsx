/**
 * 「탐색기」 패널 — VS Code 파일 탐색기 그림(쥔님 2026-11-01 17:28: *"VS 코드로 가자"*).
 *
 * 🔴 ⛔ 탐색기는 타입을 모른다 — 아이콘·컨테이너 여부·열기·「새로 만들기」 목록은 전부 등록 표(model/types.ts)에 묻는다.
 *    이 파일에 `type ===` 비교를 두지 않는다(설계 「여기서 죽는다」 — 탐색기가 타입을 알게 되는 유혹).
 * ⭐ 누르기(VS Code 식): 한 번 = 고르기만(폴더는 접기/펴기도) · 두 번·Enter = 열기 · F2 = 이름 바꾸기.
 * 🔴 드래그·우클릭은 useDragLeaf 한 훅으로 가른다(탭 드래그와 같은 가름 — 마우스 8px / 손가락 350ms 무장).
 *    떨굴 자리 셋(줄 위 25% 앞 · 아래 25% 뒤 · 가운데 50% 안으로 · container 일 때만) · accepts/자손 금지는 빨간 표시 +
 *    모델 move 가 마지막 관문. 좁은 화면(narrow)에선 드래그를 끄고 메뉴의 「위로·아래로」로.
 * ⭐ 누르기: 한 번 = 고르기(폴더는 접기/펴기) · 이미 고른 줄을 또 누르면(지연) 이름바꾸기(맥 Finder) · 두 번 = 열기 · F2 = 이름.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PluginHost, MenuEntry } from '../../../pane-ui-system/plugin';
import { usePluginRegistry } from '../../../pane-ui-system/plugin';
import { Icon, SectionHeader, IconButton, ContextMenu, useDragLeaf } from '../../../pane-ui-system';
import { flatten, filterIds, parentOf, isDescendant, type Tree } from '../model/tree';
import { isContainerType, iconOf, isKnownType, createCandidates, typeMenu, typeMenuByType, canOpenType, canDo, acceptsChild } from '../model/types';
import { clearDerived } from '../model/derive';
import { buildMainRows, type ExplorerRow } from './rows';
import { useExplorer, select, toggle, cancelRename, commitRename, moveNode } from '../store';

/** 들여쓰기 한 단(px) — 줄 높이는 토큰(--s-row)이 쥐고, 가로 들여쓰기만 여기서 센다. */
const INDENT = 12;
const BASE_PAD = 6;
/** 🗑 휴지통 구역 높이(px) — 끌어서 조절, 기기별로 host.storage 에 남긴다(쥔님 2026-11-01 22:51 *"휴지통 크기 핸들 조절 안되네"*). */
const TRASH_MIN_H = 72;
const TRASH_MAX_H = 520;
const TRASH_DEFAULT_H = 180;
const TRASH_H_KEY = 'trash-h';
const clampTrashH = (h: number): number =>
    Math.min(TRASH_MAX_H, Math.max(TRASH_MIN_H, Number.isFinite(h) ? h : TRASH_DEFAULT_H));
/** 이미 고른 줄을 또 누른 뒤 이름바꾸기까지 기다리는 시간(ms) — 두 번 누르기(열기)면 그 전에 취소된다(맥 Finder 꼴). */
const RENAME_CLICK_DELAY = 450;

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

    // 🔴 마지막 줄 아래 빈 바닥에 떨구면 — 깊이와 무관하게 「루트 맨 끝」으로(폴더 밖으로 꺼내는 길).
    //    지금까지 여긴 마지막(깊은) 줄의 형제로 붙어 루트로 못 나왔다(쥔님 2026-11-01 19:34).
    const lastEl = rows[rows.length - 1];
    const lastRect = lastEl.getBoundingClientRect();
    if (y > lastRect.bottom) {
        const dnode = tree.nodes[dragId];
        const rootNode = tree.nodes[tree.root];
        const sibs = rootNode.children.filter((c) => c !== dragId);
        const ok = !!dnode && tree.root !== dragId
            && !isDescendant(tree, tree.root, dragId)
            && acceptsChild(rootNode.type, dnode.type);
        return { targetId: lastEl.getAttribute('data-row-id') ?? tree.root, pos: 'after', rect: lastRect, destParent: tree.root, index: sibs.length, ok };
    }

    let target: HTMLElement | null = null;
    for (const el of rows) {
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) { target = el; break; }
    }
    if (!target) target = y < rows[0].getBoundingClientRect().top ? rows[0] : lastEl;
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

export function ExplorerView({ host }: { host: PluginHost }) {
    const { tree, selectedId, renamingId, purgeConfirmId, purgeAllConfirm, loading } = useExplorer();

    const [query, setQuery] = useState('');
    const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
    const [narrow, setNarrow] = useState<boolean>(() => host.screen.narrow());
    const [trashOpen, setTrashOpen] = useState(false);
    // 🔴 휴지통 높이 — 기기별 저장값에서 읽어 와 끌어서 조절한다(TrashResizeHandle). 끝에 host.storage 로 남긴다.
    const [trashH, setTrashH] = useState<number>(() =>
        clampTrashH(host.storage.get<number>(TRASH_H_KEY, TRASH_DEFAULT_H)));
    const [hoverId, setHoverId] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const draggedRef = useRef(false);
    // 이미 고른 줄을 또 눌렀을 때의 이름바꾸기 지연 타이머(두 번 누르기면 취소).
    const renameTimer = useRef<number | null>(null);
    const clearRenameTimer = useCallback(() => {
        if (renameTimer.current != null) { clearTimeout(renameTimer.current); renameTimer.current = null; }
    }, []);
    useEffect(() => () => clearRenameTimer(), [clearRenameTimer]);

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
    // 🔴 루트 줄은 걷었다(쥔님 2026-11-01 22:17 정정: *"그 루트는 제일 바깥 공간 아무데나 누르면 루트 선택되게"*).
    //    루트는 줄로 그리지 않고, 「바깥 빈 공간 클릭 = 선택 해제(미선택=루트)」로 고른다(VS Code 식 · 아래 onListClick).
    const rows: ExplorerRow[] = q
        ? flatten(tree, tree.root, isContainerType, {
            expandAll: true,
            keep: (() => { const k = filterIds(tree, tree.root, (n) => n.name.toLowerCase().includes(q)); return (id: string) => k.has(id); })(),
        }).map((r) => ({ kind: 'node' as const, id: r.id, depth: r.depth, node: r.node, hasChildren: r.hasChildren }))
        : buildMainRows(tree, tree.root);
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
    //    🔴 이미 고른 실노드를 또 누르면(맥 Finder) 지연 뒤 이름바꾸기 — 두 번 누르기(열기)면 dblRow 가 취소한다.
    //    접기/펴기는 그래도 쉐브론으로 쥔다(이미 고른 폴더 몸통을 눌러도 토글 대신 이름바꾸기로 간다).
    const clickRow = (row: ExplorerRow): void => {
        if (draggedRef.current) { draggedRef.current = false; return; }   // 방금 드래그 끝 — 클릭 삼킨다
        rootRef.current?.focus();                                        // 단축키(Ctrl+Z 등)가 뷰로 오게
        const wasSelected = selectedId === row.id && row.kind === 'node';
        if (wasSelected && canDo(row.node.type, 'rename')) {
            clearRenameTimer();
            renameTimer.current = window.setTimeout(() => { host.commands.run('project-explorer.rename'); }, RENAME_CLICK_DELAY);
            return;
        }
        select(row.id);
        if (row.kind === 'node' && isContainerType(row.node.type)) toggle(row.id);
    };
    // 두 번 누르기 — 예약된 이름바꾸기를 취소하고(열기가 이긴다), 컨테이너는 아무 일 없음, openable 이면 열기(실노드·유도 공통).
    const dblRow = (row: ExplorerRow): void => {
        clearRenameTimer();
        if (row.kind === 'node' && isContainerType(row.node.type)) return;
        select(row.id);
        run('project-explorer.open');
    };

    // ── 바깥 빈 공간 누르기(마지막 줄 아래 바닥·빈 목록·패널 여백) = 고른 것 해제 → 「미선택=루트」 ──
    //    🔴 쥔님 2026-11-01 22:17: *"제일 바깥 공간 아무데나 누르면 루트 선택되게"*(VS Code 식).
    //    드롭의 「마지막 줄 아래 = 루트 끝」(resolveDrop)과 같은 영역이다 — 줄 위가 아닌 클릭만 여기로 온다.
    //    이름바꾸는 중이면 input 의 onBlur 가 먼저 그 이름을 확정하고(같은 결), 그 뒤 선택이 풀린다.
    const onListClick = (e: React.MouseEvent): void => {
        if (draggedRef.current) { draggedRef.current = false; return; }   // 방금 드래그 끝 — 클릭 삼킨다
        if ((e.target as HTMLElement).closest('[data-row-id]')) return;    // 줄 위 클릭은 그 줄(clickRow)이 처리
        rootRef.current?.focus();
        select(null);
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
                    if (p && p !== tree.root) select(p);   // 루트는 줄이 아니다 — 부모로만(루트 해제는 Esc·빈 공간)
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
            case 'Escape': if (sel) { e.preventDefault(); select(null); } break;   // 선택 해제 = 루트(쥔님 22:17)
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
        const baseType = selNode ? selNode.type : (tree.nodes[tree.root]?.type ?? 'folder');
        const items: MenuEntry[] = [];
        // ContextMenu 는 하위 메뉴가 없다 → 「새 <label>」 로 평평하게(지금은 폴더 하나).
        for (const def of createCandidates(baseType)) {
            items.push({ label: `새 ${def.label}`, icon: 'plus', commandId: `project-explorer.new-${def.type}` });
        }
        if (selNode && !inTrash) {
            items.push({ label: '이름 바꾸기', icon: 'edit', commandId: 'project-explorer.rename', disabled: !canDo(selNode.type, 'rename') });
            items.push({ label: '삭제', icon: 'trash', danger: true, commandId: 'project-explorer.remove', disabled: !canDo(selNode.type, 'delete') });
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
                <SectionHeader title="탐색기" />
                <p className="px-pad py-3 text-[12px] text-muted select-none">불러오는 중…</p>
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
                title="탐색기"
                end={(
                    <IconButton icon="plus" label="새 폴더" onClick={() => host.commands.run('project-explorer.new-folder')} />
                )}
            />

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

            <div ref={listRef} className="flex-1 min-h-0 overflow-auto py-1 relative" onClick={onListClick}>
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
                            onMouseEnter={() => setHoverId(row.id)}
                            onMouseLeave={() => setHoverId((h) => (h === row.id ? null : h))}
                            className={`flex items-center gap-1 h-row pr-2 cursor-pointer select-none transition-colors ${
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

                            {/* ⋯ 단추 — 올렸을 때(모바일은 늘) 오른쪽 끝에. 누르면 우클릭과 같은 메뉴를 그 자리에(메뉴 코드는 하나) */}
                            {!isRenaming && (hoverId === row.id || narrow) && (
                                <IconButton
                                    icon="dots"
                                    label="메뉴"
                                    size={14}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        clearRenameTimer();
                                        select(row.id);
                                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                        setMenu({ x: r.left, y: r.bottom });
                                    }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 🗑 휴지통 — 맨 아래 접이식. 안의 줄은 회색. 영구삭제·비우기는 인라인 확인(⛔ window.confirm 안 씀) */}
            {/* 🔴 relative — 펼쳤을 때 본 나무↔휴지통 사이 세로 드래그 핸들(TrashResizeHandle)이 위 경계에 절대배치로 앉는다 */}
            <div className="shrink-0 border-t border-line relative">
                {trashOpen && (
                    <TrashResizeHandle
                        height={trashH}
                        onResize={(h) => setTrashH(clampTrashH(h))}
                        onCommit={(h) => host.storage.set(TRASH_H_KEY, clampTrashH(h))}
                    />
                )}
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
                    // 🔴 높이는 끌어 정한 trashH(px) — max-h-[40%] 고정이 아니다. overflow-auto + 바닥 여백(pb-2)으로
                    //    스크롤을 끝까지 내리면 마지막 줄이 완전히 보인다(쥔님 22:51 *"휴지통 아래 뭔가 가리고 … 마지막 줄 반쯤 잘린다"*).
                    <div className="overflow-auto pb-2" style={{ height: trashH }}>
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

/**
 * 🔴 본 나무 ↔ 휴지통 사이 세로 드래그 핸들 — 창틀의 분할 손잡이와 **같은 부품**(.resize-handle / .resize-bar CSS, index.css)을
 *   가로 띠로 쓴다. ⛔ 새 위젯을 만들지 않았고, shell/ 를 직접 import 하지도 않는다(플러그인 경계 — 구조 검사 ⑥).
 *   위로 끌면 휴지통이 커진다(경계가 올라간다) = startH + (startY − 지금 Y). onCommit 으로 host.storage 에 남긴다.
 */
function TrashResizeHandle({ height, onResize, onCommit }: {
    height: number;
    onResize: (h: number) => void;
    onCommit: (h: number) => void;
}) {
    const [dragging, setDragging] = useState(false);
    const start = useRef<{ y: number; h: number } | null>(null);
    const latest = useRef(height);
    latest.current = height;

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        start.current = { y: e.clientY, h: latest.current };
        setDragging(true);
    }, []);
    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const s = start.current;
        if (!s) return;
        onResize(s.h + (s.y - e.clientY));   // 위로(음의 Y 이동) 끌면 커진다
    }, [onResize]);
    const end = useCallback(() => {
        if (!start.current) return;
        start.current = null;
        setDragging(false);
        onCommit(latest.current);
    }, [onCommit]);

    // 끄는 동안 커서·글자 선택 — 창틀 손잡이와 같은 결(SplitHandle)
    useEffect(() => {
        if (!dragging) return;
        const prev = document.body.style.cursor;
        document.body.style.cursor = 'row-resize';
        document.body.classList.add('select-none');
        return () => { document.body.style.cursor = prev; document.body.classList.remove('select-none'); };
    }, [dragging]);

    return (
        <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="휴지통 높이 조절"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => {
                if (e.key === 'ArrowUp') { e.preventDefault(); onResize(latest.current + 16); onCommit(latest.current + 16); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); onResize(latest.current - 16); onCommit(latest.current - 16); }
            }}
            title="끌어서 휴지통 높이 조절"
            // 잡는 자리는 위아래로 넉넉히(h-3, -top-1.5), 보이는 띠는 가운데 1px — 창틀 손잡이와 같은 치수
            className="resize-handle absolute left-0 right-0 -top-1.5 h-3 cursor-row-resize z-20 touch-none"
        >
            <div className={`resize-bar absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px ${dragging ? 'is-dragging' : ''}`} />
        </div>
    );
}
