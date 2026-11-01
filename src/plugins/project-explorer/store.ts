/**
 * 탐색기 스토어 — 나무 + 「고른 노드」 + 「이름 바꾸는 중」을 useSyncExternalStore 로(pane-test/store.ts 꼴).
 *
 * 🔴 연산은 전부 (Tree)=>Tree 순수 함수(model/tree.ts)를 적용하고 persist.save 를 부른다 — apply() 한 곳에서.
 *    apply 가 rev 를 올린다(설계 「갈아끼울 데」: 되돌리기가 변경 원장으로 갈 때 이 rev 가 키가 된다).
 * ⭐ 명령의 대상 노드는 여기 「고른 노드」에서 읽는다(🙋 5 — 창틀 CommandContext 는 안 넓힌다).
 */
import { useSyncExternalStore } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';
import {
    type Tree, emptyTree, uid,
    createNode, rename, move, remove, duplicate, toggleCollapse, collapseAll, parentOf,
} from './model/tree';
import { isContainerType, getType, acceptsChild } from './model/types';
import { load, save } from './persist';

interface ExplorerState {
    tree: Tree;
    /** 고른 노드 — 명령·키보드의 대상. */
    selectedId: string | null;
    /** 이름 바꾸는 중인 노드(줄 자리에 input 이 뜬다). */
    renamingId: string | null;
}

let state: ExplorerState = { tree: emptyTree(), selectedId: null, renamingId: null };
let hostRef: PluginHost | null = null;
const listeners = new Set<() => void>();

function emit(): void {
    for (const l of listeners) l();
}

/** 활성(index.ts)이 한 번 부른다 — 저장된 나무를 읽어 들인다. */
export function initStore(host: PluginHost): void {
    hostRef = host;
    state = { tree: load(host), selectedId: null, renamingId: null };
    emit();
}

/** 순수 연산 적용 + rev 올리기 + 저장 — 구조를 바꾸는 모든 길이 여기로 모인다. */
function apply(fn: (t: Tree) => Tree, patch?: Partial<ExplorerState>): void {
    const next = fn(state.tree);
    const bumped: Tree = { ...next, rev: next.rev + 1 };
    state = { ...state, tree: bumped, ...patch };
    if (hostRef) save(hostRef, bumped);
    emit();
}

// ─────────────────────────── 구독 ───────────────────────────

export function useExplorer(): ExplorerState {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        () => state,
        () => state,
    );
}

export function getState(): ExplorerState {
    return state;
}

// ─────────────────────────── 선택·이름바꾸기 상태 ───────────────────────────

export function select(id: string | null): void {
    if (state.selectedId === id) return;
    state = { ...state, selectedId: id };
    emit();
}

export function startRename(id: string): void {
    state = { ...state, selectedId: id, renamingId: id };
    emit();
}

export function cancelRename(): void {
    if (state.renamingId == null) return;
    state = { ...state, renamingId: null };
    emit();
}

/** 이름 확정 — 비면 model/tree.rename 이 원래 이름을 지킨다. 어느 쪽이든 input 은 닫는다. */
export function commitRename(name: string): void {
    const id = state.renamingId;
    if (!id) return;
    apply((t) => rename(t, id, name), { renamingId: null });
}

// ─────────────────────────── 구조 연산(명령이 부른다) ───────────────────────────

/** 「새 폴더」를 꽂을 부모 — 고른 노드가 컨테이너면 그 안, 아니면 루트. */
function targetParent(): string {
    const sel = state.selectedId;
    if (sel && state.tree.nodes[sel] && isContainerType(state.tree.nodes[sel].type)) return sel;
    return state.tree.root;
}

/**
 * 타입 하나를 「새로 만들기」 — 고른 노드(컨테이너면 그 안, 아니면 루트) 밑에. 만들자마자 고르고 이름바꾸기(VS Code 식).
 *   🔴 타입 이름 비교가 없다 — create.init 과 label 은 등록 표에서 온다. 「새 폴더」도 이 길을 탄다(folder 도 표의 한 줄).
 */
export function createUnder(type: string, parentId?: string): void {
    const parent = parentId ?? targetParent();
    const def = getType(type);
    const init = def?.create?.init?.(parent) ?? {};
    const id = uid();
    const name = typeof init.name === 'string' ? init.name : (def?.create?.label ?? def?.label ?? '새 노드');
    apply(
        (t) => createNode(t, parent, { id, type, name, data: init.data }),
        { selectedId: id, renamingId: id },
    );
}

/** 새 폴더 — createUnder('folder') 의 설탕(헤더 단추·리본이 부른다). */
export function newFolder(parentId?: string): void {
    createUnder('folder', parentId);
}

/** 고른 노드 이름 바꾸기 시작(F2·메뉴). */
export function renameSelected(): void {
    if (state.selectedId) startRename(state.selectedId);
}

/** 고른 노드 삭제 → 휴지통(메뉴·Delete). 지운 뒤엔 선택을 부모로 옮긴다. */
export function removeSelected(): void {
    const id = state.selectedId;
    if (!id || id === state.tree.root || id === state.tree.trash) return;
    const nextSel = parentOf(state.tree, id);
    apply((t) => remove(t, id), { selectedId: nextSel === state.tree.root ? null : nextSel, renamingId: null });
}

/** 접기/펴기 토글 — 화살표·오른쪽/왼쪽 화살표 키가 쓴다. */
export function toggle(id: string): void {
    apply((t) => toggleCollapse(t, id));
}

/** 모두 접기(패널 머리 단추·폰 서랍). */
export function collapseAllNodes(): void {
    apply((t) => collapseAll(t));
}

/** 복제 — 고른(또는 준) 노드를 깊은 복제해 바로 뒤에. 복제본 뿌리를 골라 준다. */
export function duplicateNode(id?: string): void {
    const target = id ?? state.selectedId;
    if (!target || target === state.tree.root || target === state.tree.trash) return;
    if (!state.tree.nodes[target]) return;
    let firstId: string | null = null;
    const gen = (): string => { const x = uid(); if (firstId === null) firstId = x; return x; };
    apply((t) => duplicate(t, target, gen));
    if (firstId) select(firstId);
}

/** 옮기기 — N2 드래그·메뉴가 쓸 자리. 🔴 accepts 를 move 에 주입한다(마지막 관문). */
export function moveNode(id: string, parentId: string, index?: number): void {
    apply((t) => move(t, id, parentId, index, acceptsChild));
}

/**
 * 고른 노드를 형제 사이에서 한 칸 — 좁은 화면 메뉴의 「위로·아래로」(드래그 대신).
 *   delta: -1 위로 · +1 아래로. 끝이면 아무 일 없음.
 */
export function nudgeSelected(delta: -1 | 1): void {
    const id = state.selectedId;
    if (!id) return;
    const parent = parentOf(state.tree, id);
    if (!parent) return;
    const sibs = state.tree.nodes[parent].children;
    const at = sibs.indexOf(id);
    const to = at + delta;
    if (to < 0 || to >= sibs.length) return;
    // move 는 id 를 뺀 뒤 index 에 꽂는다 — 뺀 배열 기준 자리로 환산한다.
    const without = sibs.filter((c) => c !== id);
    const anchor = sibs[to];
    const dest = without.indexOf(anchor) + (delta === 1 ? 1 : 0);
    moveNode(id, parent, dest);
}
