/**
 * 「탐색기」 패널 — 옵시디언 파일 탐색기 그림(쥔님 2026-11-02: *"파일 선택 방법 그냥 다시 옵시디언으로 가야겠다"* —
 *   11-01 의 VS Code 식(한 번=고르기, 두 번=열기)을 뒤집었다).
 *
 * 🔴 ⛔ 탐색기는 타입을 모른다 — 아이콘·컨테이너 여부·열기·「새로 만들기」 목록은 전부 등록 표(model/types.ts)에 묻는다.
 *    이 파일에 `type ===` 비교를 두지 않는다(설계 「여기서 죽는다」 — 탐색기가 타입을 알게 되는 유혹).
 * ⭐ 누르기(옵시디언식): 한 번 = 고르기 + openable 이면 바로 열기 · 컨테이너만이면 펴기/접기 · Enter 는 한 번 누르기와 같은 일 · F2 = 이름.
 * 🔴 드래그·우클릭은 useDragLeaf 한 훅으로 가른다(탭 드래그와 같은 가름 — 마우스 8px / 손가락 350ms 무장).
 *    떨굴 자리 셋(줄 위 25% 앞 · 아래 25% 뒤 · 가운데 50% 안으로 · container 일 때만) · accepts/자손 금지는 빨간 표시 +
 *    모델 move 가 마지막 관문. 좁은 화면(narrow)에선 드래그를 끄고 메뉴의 「위로·아래로」로.
 * ⭐ 이미 고른 줄을 또 누르면(지연) 이름바꾸기(맥 Finder 느린 재클릭 · 유지) · 두 번 누르기는 그 예약만 취소(열기는 한 번 누르기가 이미 했다).
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { PluginHost, MenuEntry } from '../../../pane-ui-system/plugin';
import { usePluginRegistry } from '../../../pane-ui-system/plugin';
import { Icon, SectionHeader, IconButton, ContextMenu, useDragLeaf, undoKey } from '../../../pane-ui-system';
import { flatten, filterIds, parentOf, isDescendant, newFolderParent, violatesUnique, type Tree } from '../model/tree';
import { isContainerType, nodeHidden, iconOf, emojiOf, createIconOf, isKnownType, createCandidates, typeMenu, typeMenuByType, canOpenType, canDo, canCreateType, acceptsChild, activateVerb, uniqueOf } from '../model/types';
import { clearDerived } from '../model/derive';
import { buildMainRows, type ExplorerRow } from './rows';
import { useExplorer, select, clickSelect, selectAllRows, toggle, cancelRename, commitRename, moveNodes, newNode } from '../store';

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

/**
 * 포인터 자리(x,y)를 떨굴 자리로 — 줄 높이 25/50/25 띠. DOM 을 더듬으니 순수 아님(drop-resolve 와 같은 결).
 *   🔴 dragIds = 같이 끌리는 것 전부(멀티 셀렉트) — ok 는 **전부**가 통과해야 참(하나라도 막히면 금지 표시 · 쥔님 2026-11-02).
 */
function resolveDrop(container: HTMLElement | null, _x: number, y: number, dragId: string, dragIds: string[], tree: Tree): DropResolved | null {
    if (!container) return null;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]'));
    if (rows.length === 0) return null;

    // 🔴 마지막 줄 아래 빈 바닥에 떨구면 — 깊이와 무관하게 「루트 맨 끝」으로(폴더 밖으로 꺼내는 길).
    //    지금까지 여긴 마지막(깊은) 줄의 형제로 붙어 루트로 못 나왔다(쥔님 2026-11-01 19:34).
    const lastEl = rows[rows.length - 1];
    const lastRect = lastEl.getBoundingClientRect();
    if (y > lastRect.bottom) {
        const rootNode = tree.nodes[tree.root];
        const sibs = rootNode.children.filter((c) => c !== dragId);
        const ok = dragIds.every((did) => {
            const dn = tree.nodes[did];
            return !!dn && tree.root !== did && !isDescendant(tree, tree.root, did)
                && canDo(dn.type, did, 'move')
                && (uniqueOf(dn.type) !== 'tree' || parentOf(tree, did) === tree.root)
                && acceptsChild(rootNode.type, dn.type)
                && !violatesUnique(tree, dn.type, tree.root, did, uniqueOf);
        });
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
    const dp = tree.nodes[destParent];
    const ok = !!dp && dragIds.every((did) => {
        const dn = tree.nodes[did];
        return !!dn && destParent !== did && !isDescendant(tree, destParent, did)
            && canDo(dn.type, did, 'move')
            && (uniqueOf(dn.type) !== 'tree' || parentOf(tree, did) === destParent)   // 싱글톤은 제 부모 안 순서만
            && acceptsChild(dp.type, dn.type)
            && !violatesUnique(tree, dn.type, destParent, did, uniqueOf);
    });
    return { targetId, pos, rect, destParent, index, ok };
}

export function ExplorerView({ host }: { host: PluginHost }) {
    const { tree, selectedIds, selectedId, renamingId, renameInitial, renamePlaceholder, purgeConfirmId, purgeAllConfirm, deleteConfirm, loading } = useExplorer();

    const [query, setQuery] = useState('');
    // create: 헤더 + 단추가 연 「새로 만들기」 메뉴(우클릭과 같은 후보 · 모바일엔 우클릭이 없다 — 쥔님 2026-11-09)
    const [menu, setMenu] = useState<{ x: number; y: number; create?: boolean } | null>(null);
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
    const trashRows = flatten(tree, tree.trash, isContainerType, { hidden: nodeHidden });
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
    const allRows: ExplorerRow[] = q
        ? flatten(tree, tree.root, isContainerType, {
            expandAll: true,
            hidden: nodeHidden,
            // 🔴 숨긴 노드(레코드·조건부)는 검색에도 안 걸린다(「상위의 데이터」·권한 없음 · 쥔님 2026-11-02) — 안 그러면 숨은 노드가 제 부모 폴더를 「맞은 줄」로 띄운다.
            keep: (() => { const k = filterIds(tree, tree.root, (n) => !nodeHidden(n) && n.name.toLowerCase().includes(q)); return (id: string) => k.has(id); })(),
        }).map((r) => ({ kind: 'node' as const, id: r.id, depth: r.depth, node: r.node, hasChildren: r.hasChildren }))
        : buildMainRows(tree, tree.root, undefined, nodeHidden);
    // 🔴 고정 구역 — 맨 위 싱글톤(계정 등)과 그 자손은 휴지통처럼 따로, 나무 위에 떼어 그린다(쥔님 2026-11-09 「너무 평범해 · 실수로 지운다」).
    //    줄은 깊이 우선 순서라 depth 0 줄부터 다음 depth 0 줄 전까지가 한 덩어리다. 키보드 순서는 고정 → 나무.
    const pinnedRows: ExplorerRow[] = [];
    const mainRows: ExplorerRow[] = [];
    {
        let pin = false;
        for (const r of allRows) {
            if (r.depth === 0) pin = r.kind === 'node' && uniqueOf(r.node.type) === 'tree';
            (pin ? pinnedRows : mainRows).push(r);
        }
    }
    const rows: ExplorerRow[] = [...pinnedRows, ...mainRows];
    const selRow = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;
    const rowsOrder = rows.map((r) => r.id);   // 보이는 줄 순서 — Shift 범위·Ctrl+A 가 쓴다

    // 끌리는 것 전부 — 고른 것 중 하나를 끌면 고른 전부, 아니면 그 하나만(쥔님 2026-11-02).
    const dragSetOf = (id: string): string[] => (selectedIds.includes(id) ? selectedIds : [id]);

    // ── 드래그 + 우클릭 한 훅 — 좁은 화면에선 끈다(그땐 메뉴의 위로/아래로) ──
    const onDrop = useCallback((dragId: string, x: number, y: number) => {
        draggedRef.current = true;
        if (isDescendant(tree, dragId, tree.trash)) return;          // 휴지통 줄은 드래그로 안 옮긴다
        const set = selectedIds.includes(dragId) ? selectedIds : [dragId];
        const hit = resolveDrop(listRef.current, x, y, dragId, set, tree);
        if (hit && hit.ok) moveNodes(set, hit.destParent, hit.index);
    }, [tree, selectedIds]);

    // 🔴 고른 것 밖을 우클릭하면 그 하나로 바뀐다(VS Code) · 안을 우클릭하면 선택 유지 · 빈 바닥이면 해제.
    const onContext = useCallback((x: number, y: number, el: HTMLElement) => {
        const row = el.closest?.('[data-row-id]') as HTMLElement | null;
        const id = row?.getAttribute('data-row-id') ?? null;
        if (id === null || !selectedIds.includes(id)) select(id);
        setMenu({ x, y });
    }, [selectedIds]);

    const { bind, drag } = useDragLeaf({ enabled: !narrow, axis: 'y', onContext, onDrop });
    const preview = drag ? resolveDrop(listRef.current, drag.x, drag.y, drag.leafId, dragSetOf(drag.leafId), tree) : null;

    // ── 줄 하나 누르기(옵시디언식 · 쥔님 2026-11-02) — 고르기 + openable 이면 바로 열기 · 컨테이너만이면 펴기/접기. ──
    //    🔴 이미 고른 실노드를 또 누르면(맥 Finder 느린 재클릭) 지연 뒤 이름바꾸기 — 두 번 누르기면 dblRow 가 취소한다(유지).
    //    접기/펴기는 그래도 ▸ 쉐브론으로도 쥔다(stopPropagation) — 폴더+파일(달력 저장소)은 몸통=열기, ▸=펴기/접기.
    const clickRow = (row: ExplorerRow, e: React.MouseEvent): void => {
        if (draggedRef.current) { draggedRef.current = false; return; }   // 방금 드래그 끝 — 클릭 삼킨다
        rootRef.current?.focus();                                        // 단축키(Ctrl+Z 등)가 뷰로 오게
        // 🔴 Ctrl/⌘·Shift 가 눌린 클릭은 **고르기만**(열지도 펴지도 않는다 · 쥔님 2026-11-02) — 맨 클릭만 연다.
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl || e.shiftKey) {
            clearRenameTimer();
            clickSelect(row.id, rowsOrder, { ctrl, shift: e.shiftKey });
            return;
        }
        // 이미 **그 하나만** 고른 실노드를 또 누르면(맥 Finder 느린 재클릭) 지연 뒤 이름바꾸기 — 두 번 누르기면 dblRow 가 취소.
        const wasSelected = selectedId === row.id && selectedIds.length === 1 && row.kind === 'node';
        if (wasSelected && canDo(row.node.type, row.id, 'rename')) {
            clearRenameTimer();
            renameTimer.current = window.setTimeout(() => { host.commands.run('project-explorer.rename'); }, RENAME_CLICK_DELAY);
            return;
        }
        select(row.id);
        // 🔴 한 번 누르기 = Enter 와 같은 일: openable → 열기 · 컨테이너만 → 펴기/접기 · 그 외 → 열기(유도 줄도 열기 시도, openById 가 안 열면 가만).
        const verb = row.kind === 'node' ? activateVerb(row.node.type, 'click') : 'open';
        if (verb === 'toggle') toggle(row.id);
        else if (verb === 'open') run('project-explorer.open');
    };
    // 두 번 누르기 — 옵시디언식이라 따로 할 일이 없다(한 번 누르기가 이미 열거나 폈다). 예약된 이름바꾸기만 취소한다(빠른 둘째 클릭 = 열기, 이름바꾸기 아님).
    const dblRow = (): void => {
        clearRenameTimer();
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
        const u = undoKey(e);
        if (u) {
            e.preventDefault();
            run(u === 'redo' ? 'project-explorer.redo' : 'project-explorer.undo');
            return;
        }
        // 🔴 Ctrl/⌘+A — 보이는 줄 전부 고르기(이름칸·검색칸 안에선 위 INPUT 가드가 이미 브라우저에 양보한다)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault();
            selectAllRows(rowsOrder);
            return;
        }
        const sel = selectedId;
        const selNode = sel ? tree.nodes[sel] : null;
        const idx = rows.findIndex((r) => r.id === sel);
        // ↑↓ — Shift 면 범위 늘리기(anchor~새 줄), 아니면 하나만 고르기.
        const selectRow = (i: number): void => {
            const r = rows[i];
            if (!r) return;
            if (e.shiftKey) clickSelect(r.id, rowsOrder, { shift: true });
            else select(r.id);
        };
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
            case 'Enter': {
                e.preventDefault();
                if (sel) {
                    // openable 이면 열기(컨테이너여도 · 달력 저장소) · 컨테이너만이면 펴기/접기 · 유도(selNode 없음)는 열기
                    const verb = selNode ? activateVerb(selNode.type, 'enter') : 'open';
                    if (verb === 'toggle') toggle(sel);
                    else run('project-explorer.open');
                }
                break;
            }
            case 'F2': e.preventDefault(); if (sel) host.commands.run('project-explorer.rename'); break;
            case 'Delete': case 'Backspace': e.preventDefault(); if (sel) host.commands.run('project-explorer.remove'); break;
            case 'Escape': if (sel) { e.preventDefault(); select(null); } break;   // 선택 해제 = 루트(쥔님 22:17)
        }
    };

    // ── 우클릭 메뉴 — 등록 표에서 「새로 만들기」를 짜고(⛔ 타입 비교 없음), 나머지 동작을 붙인다 ──
    // 「새 <타입>」 줄들 — 우클릭(via 'context')과 + 단추(via 'selection')가 같은 표를 쓴다. 생길 자리의 타입이 받는 것만.
    const createItems = (via: 'selection' | 'context'): MenuEntry[] => {
        const parent = newFolderParent(tree, selectedId, isContainerType, via);
        const baseType = via === 'context'
            ? (selectedId ? tree.nodes[selectedId]?.type : undefined) ?? tree.nodes[tree.root]?.type ?? 'folder'
            : tree.nodes[parent]?.type ?? 'folder';
        const out: MenuEntry[] = [];
        // 🔑 싱글톤이 이미 있으면 숨기지 말고 회색(비활성) + 이유를 라벨에 보인다(설계) — 생길 자리에서 판정.
        for (const def of createCandidates(baseType)) {
            const dup = violatesUnique(tree, def.type, parent, null, uniqueOf);
            const blocked = !canCreateType(def.type, parent);   // 🔑 「만들기」 가림 — 회색 + 이유(탐색기는 이유의 속을 모른다)
            const icon = createIconOf(def);   // 「plus」만 줄지어 있으면 무엇을 만드는지 안 보인다 — 타입 자신의 아이콘
            out.push(
                dup ? { label: `새 ${def.label} (이미 있음)`, icon, disabled: true }
                    : blocked ? { label: `새 ${def.label} (만들 수 없음)`, icon, disabled: true }
                        : { label: `새 ${def.label}`, icon, onClick: () => newNode(def.type, { via, targetId: selectedId ?? undefined }) });
        }
        return out;
    };
    // 메뉴가 비면 「새 폴더」 폴백 — 단 그 부모가 폴더를 받을 때만(달력 저장소처럼 폴더를 안 받는 컨테이너엔 「새 폴더」가 뜨면 안 된다).
    const folderFallback = (via: 'selection' | 'context', baseType: string): MenuEntry[] =>
        acceptsChild(baseType, 'folder') ? [{ label: '새 폴더', icon: 'folder', onClick: () => newNode('folder', { via, targetId: selectedId ?? undefined }) }] : [];

    const buildMenu = (): MenuEntry[] => {
        if (menu?.create) {
            const c = createItems('selection');
            if (c.length === 0) c.push(...folderFallback('selection', tree.nodes[newFolderParent(tree, selectedId, isContainerType, 'selection')]?.type ?? 'folder'));
            return c.length ? c : [{ label: '여기에 만들 수 있는 것이 없습니다', disabled: true }];
        }
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
        // 「새로 만들기」 후보: 우클릭한 노드(없으면 보이는 루트)의 타입이 받는 것 ∩ create.under 허용.
        // 🔴 우클릭 = 「이 노드에서」(via 'context') — 폴더를 우클릭한 「새 폴더」가 그 폴더 **안**에 생긴다(+ 단추는 형제로).
        const items: MenuEntry[] = createItems('context');
        if (selNode && !inTrash) {
            // 🔴 이름 바꾸기는 **하나일 때만** 활성(여럿 고르면 비활성) · 삭제는 고른 것 전부 휴지통(쥔님 2026-11-02).
            const multi = selectedIds.length > 1;
            items.push({ label: '이름 바꾸기', icon: 'edit', commandId: 'project-explorer.rename', disabled: multi || !canDo(selNode.type, selectedId!, 'rename') });
            items.push({ label: multi ? `삭제 (${selectedIds.length}개)` : '삭제', icon: 'trash', danger: true, commandId: 'project-explorer.remove', disabled: !canDo(selNode.type, selectedId!, 'delete') });
            if (narrow) {
                items.push({ label: '위로', icon: 'up', commandId: 'project-explorer.move-up' });
                items.push({ label: '아래로', icon: 'down', commandId: 'project-explorer.move-down' });
            }
            const extra = typeMenu(selNode, selNode.id);
            if (extra.length) { items.push({ sep: true }); for (const it of extra) items.push(it); }
        }
        if (items.length === 0) items.push(...folderFallback('context', selNode ? selNode.type : (tree.nodes[tree.root]?.type ?? 'folder')));
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
            aria-multiselectable="true"
            onKeyDown={onKeyDown}
            {...bind}
        >
            <SectionHeader
                title="탐색기"
                end={(
                    <IconButton icon="plus" label="새로 만들기" onClick={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setMenu({ x: r.left, y: r.bottom, create: true });
                    }} />
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

            {/* 🔑 인라인 「지울까요?」 — 노드 타입이 confirmDelete 로 요청한 경고(⛔ window.confirm 안 씀) */}
            {deleteConfirm && (
                <div className="flex items-center gap-2 px-pad py-1.5 border-b border-line shrink-0 bg-bad/5">
                    <Icon name="trash" size={13} className="text-bad shrink-0" />
                    <span className="flex-1 min-w-0 text-[12px] text-text">{deleteConfirm.msg}</span>
                    <button type="button" onClick={() => run('project-explorer.confirm-remove')} className="px-1.5 py-0.5 rounded text-[11px] text-bad hover:bg-bad/10">지우기</button>
                    <button type="button" onClick={() => run('project-explorer.cancel-remove')} className="px-1.5 py-0.5 rounded text-[11px] text-muted hover:bg-text/[0.06]">취소</button>
                </div>
            )}

            <div ref={listRef} className="flex-1 min-h-0 overflow-auto py-1 relative" onClick={onListClick}>
                {rows.length === 0 && (
                    <p className="px-pad py-2 text-[12px] text-muted select-none">
                        {q ? '맞는 항목이 없습니다.' : '비어 있습니다 — 「새 폴더」로 시작하세요.'}
                    </p>
                )}
                {[pinnedRows, mainRows].map((list, li) => (<Fragment key={li}>
                {li === 0 && list.length > 0 && <div className="px-pad pt-1 pb-0.5 text-[11px] text-muted select-none">고정</div>}
                {li === 1 && pinnedRows.length > 0 && <div className="mx-pad my-1 border-t border-line" />}
                {list.map((row) => {
                    const isSel = selectedIds.includes(row.id);           // 고른 것 전부 강조(멀티 셀렉트)
                    const isFocus = selectedId === row.id && selectedIds.length > 1;   // 키보드 커서 — 여럿일 때만 포커스 링
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
                                onClick={(e) => clickRow(row, e)}
                                onDoubleClick={() => dblRow()}
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
                            onClick={(e) => clickRow(row, e)}
                            onDoubleClick={() => dblRow()}
                            onMouseEnter={() => setHoverId(row.id)}
                            onMouseLeave={() => setHoverId((h) => (h === row.id ? null : h))}
                            aria-current={isFocus ? true : undefined}
                            className={`flex items-center gap-1 h-row pr-2 cursor-pointer select-none transition-colors ${
                                isSel ? 'bg-accent/15' : 'hover:bg-text/[0.04]'
                            } ${isInto ? (preview!.ok ? 'ring-1 ring-inset ring-accent' : 'ring-1 ring-inset ring-bad') : isFocus ? 'ring-1 ring-inset ring-accent/40' : ''}`}
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

                            {emojiOf(row.node)
                                ? <span className="shrink-0 w-[15px] text-center text-[13px] leading-none select-none">{emojiOf(row.node)}</span>
                                : <Icon name={iconOf(row.node)} size={15} className={`shrink-0 ${known ? '' : 'text-muted'}`} />}

                            {isRenaming ? (
                                <input
                                    autoFocus
                                    key={`${row.id}:${renameInitial ?? ''}`}
                                    defaultValue={renameInitial ?? row.node.name}
                                    placeholder={renamePlaceholder ?? undefined}
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
                </Fragment>))}
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
                                    {emojiOf(row.node)
                                        ? <span className="shrink-0 w-[15px] text-center text-[13px] leading-none select-none opacity-60">{emojiOf(row.node)}</span>
                                        : <Icon name={iconOf(row.node)} size={15} className="shrink-0 text-muted" />}
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
