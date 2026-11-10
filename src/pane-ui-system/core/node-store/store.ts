/**
 * 탐색기 스토어 — 나무 + 「고른 노드」 + 「이름 바꾸는 중」을 useSyncExternalStore 로(pane-test/store.ts 꼴).
 *
 * 🔴 연산은 전부 (Tree)=>Tree 순수 함수(model/tree.ts)를 적용하고 persist.save 를 부른다 — apply() 한 곳에서.
 *    apply 가 rev 를 올린다(설계 「갈아끼울 데」: 되돌리기가 변경 원장으로 갈 때 이 rev 가 키가 된다).
 * ⭐ 명령의 대상 노드는 여기 「고른 노드」에서 읽는다(🙋 5 — 창틀 CommandContext 는 안 넓힌다).
 */
import { useSyncExternalStore } from 'react';
import { josa, focusWhenReady } from '../..';
import { CMD } from '../nodes/contracts/commands';
import { notifyUndo, type PluginHost } from '../../plugin';
import {
    type Tree, type Node, type History, emptyTree, emptyHistory, record, undo as undoHist, redo as redoHist, uid,
    createNode, rename, move, remove, restore, restoreDest, purge, purgeAll, toggleCollapse, parentOf,
    isDescendant, setData as setDataTree, setField, newFolderParent, topmostOnly, violatesUnique, normalize,
} from '../nodes/model/tree';
import { applyClick as applyClickSel, selectAll as selectAllSel, type Selection } from '../nodes/model/selection';
import { isSectionType, isContainerType, getType, acceptsChild, openType, uniqueOf, slotsOf, canDo, canCreateType, confirmDeleteMsg } from '../nodes/model/types';
import { getDerived, invalidateDerived } from '../nodes/model/derive';
import { storageKey } from '../../storage';
import { loadTree, saveTree, onRemoteNodes, isPendingLocal, rebasePending, type RemoteNodes } from './persist';

interface ExplorerState {
    tree: Tree;
    /** 🔴 고른 노드 전부 — 명령(삭제·이동·복원·휴지통행)은 이것 전부에 돈다(멀티 셀렉트 · 쥔님 2026-11-02). */
    selectedIds: string[];
    /** Shift 범위의 기준 — 맨 클릭·Ctrl 토글이 옮긴다. */
    anchorId: string | null;
    /** 🔴 포커스(키보드 커서) — 호환을 위해 이름은 selectedId 로 남긴다(읽는 자리가 많다). selectedIds 비면 null. */
    selectedId: string | null;
    /** 이름 바꾸는 중인 노드(줄 자리에 input 이 뜬다). */
    renamingId: string | null;
    /**
     * 🔑 그 인라인 입력이 「무엇」인가 — 'name'(이름바꾸기, 기본) 또는 그 외(타입의 onInput 으로 보낼 kind).
     *   'name' 이면 커밋이 노드 이름을 바꾸고, 그 외면 그 타입의 onInput(kind, 값) 으로 넘긴다(⛔ window.prompt 없이).
     */
    renameKind: string;
    /** 그 입력에 미리 채울 값(null 이면 노드 이름). createInput 생성 입력은 ''(빈 칸) · promptInput 은 준 initial. */
    renameInitial: string | null;
    /** 그 입력의 안내(placeholder) — 없으면 안 보인다. */
    renamePlaceholder: string | null;
    /** 되돌리기/다시하기 더미(스냅샷) — 구조 연산만 쌓인다. */
    history: History;
    /** 인라인 「정말 지울까요?」 — 영구 삭제를 기다리는 휴지통 노드 id(⛔ window.confirm 안 씀). */
    purgeConfirmId: string | null;
    /** 「휴지통 비우기」 인라인 확인 중. */
    purgeAllConfirm: boolean;
    /**
     * 🔑 인라인 「지울까요?」 — 노드 타입이 confirmDelete 로 경고를 요청했을 때(⛔ window.confirm 안 씀).
     *   ids: 확정 때 지울 노드들(이미 can.delete 통과분) · msg: 노드 타입이 준 경고 문구. null 이면 평소.
     */
    deleteConfirm: { ids: string[]; msg: string } | null;
    /**
     * 🔴 비동기 로드가 끝나기 전인가 — 저장소(IndexedDB)가 비동기라 생긴 칸.
     *   true 인 동안 뷰는 「불러오는 중…」 한 줄만 그리고, apply(조작)도 전부 막힌다 —
     *   빈 나무 위에 쌓인 뒤 저장돼 옛 나무를 덮는 사고를 막는 자리다.
     */
    loading: boolean;
    /** 상태바에 잠깐 비추는 한 줄(ExplorerStatus) — 「어디에도 못 넣었다」처럼 조용히 실패한 것을 알린다. null 이면 평소(노드 N). */
}

function freshState(tree: Tree): ExplorerState {
    return { tree, selectedIds: [], anchorId: null, selectedId: null, renamingId: null, renameKind: 'name', renameInitial: null, renamePlaceholder: null, history: emptyHistory(), purgeConfirmId: null, purgeAllConfirm: false, deleteConfirm: null, loading: false };
}

// ─────────────────────────── 조작 가능 관문(model 에 주입) ───────────────────────────
// 🔴 model/tree 는 등록 표를 모른다 — 「이 노드를 옮겨/지워/고쳐도 되나」 판정을 바깥(여기)이 주입한다(uniqueOf·acceptsChild 와 같은 결).
//    한 곳(canDo)만 지나므로 드래그·메뉴·단축키·공개 API 가 전부 같은 답을 받는다.
const permitMove = (type: string, id: string): boolean => canDo(type, id, 'move');
const permitRename = (type: string, id: string): boolean => canDo(type, id, 'rename');
const permitDelete = (type: string, id: string): boolean => canDo(type, id, 'delete');
const permitCreate = (type: string, parentId: string): boolean => canCreateType(type, parentId);

/** 한 개만 고른 상태로 쓰는 patch 조각 — selectedId 를 설정하던 모든 자리가 이걸 쓴다(불변식: selectedId ∈ selectedIds). */
function singleSel(id: string | null): Pick<ExplorerState, 'selectedIds' | 'anchorId' | 'selectedId'> {
    return id ? { selectedIds: [id], anchorId: id, selectedId: id } : { selectedIds: [], anchorId: null, selectedId: null };
}

let state: ExplorerState = freshState(emptyTree());
let hostRef: PluginHost | null = null;
const listeners = new Set<() => void>();

/** 막힌 조작을 알린다 — 창틀 알림(host.notify)으로. 같은 key 는 덮어 써서 연타해도 토스트가 쌓이지 않는다. */
function flashNotice(msg: string): void {
    if (!hostRef) { console.warn(`[explorer] ${msg}`); return; }
    hostRef.notify({ level: 'warn', title: msg, key: 'explorer.blocked' });
}

/** 🔑 apiBatch 중첩 깊이 — 0 이 아니면 apply 는 나무만 바꾼다(더미·저장·알림은 묶음 끝에서). */
let batchDepth = 0;

/** 🔴 N4 — 나무가 바뀔 때 「무엇이 바뀌었나(changedIds)」를 받는 구독(NodesApi.subscribe 가 이 위에 선다). */
const changeListeners = new Set<(ids: string[]) => void>();

/** 🔴 고른 노드(포커스 id) 한 개만 새로고침 너머로 기억한다 — 로딩 중엔 안 쓴다(빈 상태로 저장분을 지우지 않게). 다중 선택은 기억 안 함. */
const SEL_KEY = 'selected-node';
let lastSavedSel: string | null | undefined;
function persistSelected(): void {
    if (state.loading || state.selectedId === lastSavedSel) return;
    lastSavedSel = state.selectedId;
    try {
        if (state.selectedId) localStorage.setItem(storageKey(SEL_KEY), state.selectedId);
        else localStorage.removeItem(storageKey(SEL_KEY));
    } catch { /* 저장 못 해도 화면은 돈다 */ }
}

/** 로딩이 끝난 나무에 그 id 가 살아 있으면(휴지통 밖) 되살릴 id, 아니면 null. */
function restorableSelected(tree: Tree): string | null {
    try {
        const id = localStorage.getItem(storageKey(SEL_KEY));
        if (!id || !tree.nodes[id] || id === tree.root || id === tree.trash || isDescendant(tree, id, tree.trash)) return null;
        return id;
    } catch { return null; }
}

function emit(): void {
    persistSelected();
    for (const l of listeners) l();
}

/**
 * 두 노드가 「같은가」 — 🔴 ref 로 못 가린다: normalize 가 연산마다 모든 노드 객체를 새로 짓는다(`{...n, children}`).
 *   그래서 값으로 본다. collapsed·data·trashedFrom 은 normalize 의 얕은 spread 가 ref 를 지켜 주니 그대로 비교가 먹는다
 *   (data 는 불투명 — setData 만 바꾸고 그때 ref 가 달라진다 · children 은 배열이라 원소까지 본다).
 */
function nodeEqual(a: Node | undefined, b: Node | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.id !== b.id || a.type !== b.type || a.name !== b.name
        || a.collapsed !== b.collapsed || a.trashedFrom !== b.trashedFrom || a.data !== b.data
        || a.icon !== b.icon || a.body !== b.body) return false;
    if (a.children.length !== b.children.length) return false;
    for (let i = 0; i < a.children.length; i++) if (a.children[i] !== b.children[i]) return false;
    return true;
}

/**
 * prev→next 에서 바뀐(추가·제거·수정된) 노드 id — 🔴 양방향:
 *   prev 에만 있는 id = 삭제 · next 에만 있는 id = 추가 · 둘 다 있는데 값이 다름 = 수정. 저장 층 dirty 집합이 이걸 먹는다.
 */
function diffIds(prev: Tree, next: Tree): string[] {
    const ids = new Set<string>();
    for (const id of Object.keys(prev.nodes)) if (!nodeEqual(prev.nodes[id], next.nodes[id])) ids.add(id);
    for (const id of Object.keys(next.nodes)) if (!nodeEqual(prev.nodes[id], next.nodes[id])) ids.add(id);
    return [...ids];
}

/** 바뀐 id 들의 유도 캐시를 버리고 구독에 알린다 — apply·undo·redo 가 공통으로 쓴다. */
function fireChange(prev: Tree, next: Tree): void {
    const ids = diffIds(prev, next);
    if (ids.length === 0) return;
    for (const id of ids) invalidateDerived(id);     // 바뀐 노드의 유도 자식은 다시 계산
    for (const fn of changeListeners) { try { fn(ids); } catch { /* 하나가 던져도 나머지 */ } }
}

/** NodesApi.subscribe — 나무가 바뀔 때 changedIds 를 받는다. 돌려주는 함수로 해지. */
export function subscribeChanges(fn: (ids: string[]) => void): () => void {
    changeListeners.add(fn);
    return () => { changeListeners.delete(fn); };
}

/** 활성(index.ts)이 한 번 부른다 — 저장된 나무를 읽어 들인다. */
export function initStore(host: PluginHost): Promise<void> {
    hostRef = host;
    onRemoteNodes(applyRemote);
    // 🔴 먼저 빈 나무 + loading:true 로 세운다 — 조작·저장이 막힌 상태. 로드가 끝나면 교체한다.
    lastSavedSel = undefined;
    state = { ...freshState(emptyTree()), loading: true };
    emit();
    return loadTree(host).then((tree) => {
        const prev = state.tree;
        const restored = restorableSelected(tree);
        state = { ...freshState(tree), ...(restored ? singleSel(restored) : {}), loading: false };
        lastSavedSel = restored;   // 되살린 값은 이미 저장돼 있다 · 못 살렸으면 null 로 맞춰 다음 emit 이 낡은 키를 지운다
        emit();
        // 🔴 로딩 완료 → 다른 플러그인의 NodesApi.subscribe 를 깨운다(그때 다시 읽는다 · 빈 나무→실나무 diff).
        fireChange(prev, tree);
    });
}

/**
 * 순수 연산 적용 + rev 올리기 + 저장 — 구조를 바꾸는 모든 길이 여기로 모인다.
 *   history: 'push' 구조 연산(기본, 더미에 쌓음) · 'skip' 접힘 등(안 쌓음) · 'clear' purge(못 되돌림 — 더미도 비움).
 */
function apply(fn: (t: Tree) => Tree, opts?: { patch?: Partial<ExplorerState>; history?: 'push' | 'skip' | 'clear' }): void {
    if (state.loading) return;   // 🔴 로딩 중엔 조작 자체를 막는다 — 빈 나무를 저장해 옛 나무를 덮지 않게
    const prev = state.tree;
    const next = fn(prev);
    const bumped: Tree = { ...next, rev: next.rev + 1 };
    // 🔑 묶음(apiBatch) 안 — 나무만 갈아 끼운다. 더미·저장·알림은 묶음이 끝날 때 한 번에(되돌리기 한 칸).
    if (batchDepth > 0) { state = { ...state, tree: bumped, ...opts?.patch }; return; }
    const mode = opts?.history ?? 'push';
    const history = mode === 'push' ? record(state.history, prev)
        : mode === 'clear' ? emptyHistory()
            : state.history;
    state = { ...state, tree: bumped, history, ...opts?.patch };
    // 🔴 저장 층엔 「바뀐 노드」만 넘긴다(dirty 집합) — bumped.nodes === next.nodes 라 diffIds 결과가 같다.
    //    'clear'(영구삭제)로 사라진 노드는 purge 로 — 묘비를 남겨 다른 탭이 되살리지 못하게(R3-X).
    const purgedIds = mode === 'clear' ? Object.keys(prev.nodes).filter((id) => !bumped.nodes[id]) : undefined;
    if (hostRef) saveTree(hostRef, bumped, diffIds(prev, bumped), purgedIds);
    emit();
    fireChange(prev, next);   // 🔴 유도 캐시 무효화 + NodesApi.subscribe 알림
}

// ─────────────────────────── 탭 간 동기화(R3-X) ───────────────────────────

/**
 * 🔴 다른 탭이 저장소에 쓴 노드를 이 탭 나무에 들인다 — 노드 단위 「마지막 쓰기가 이긴다」.
 *   - 이 탭이 아직 안 쓴 칸(dirty)은 persist 가 이미 뺐다(편집 유실 ⛔ · 내 쓰기 뒤에 다시 읽는다).
 *   - ⭐ 접힘(collapsed)은 보기 상태다 — 이 탭의 값을 지킨다(탭마다 따로).
 *   - ⭐ 되돌리기 더미도 같은 칸을 고쳐 둔다 — 내 ⌘Z 가 다른 탭의 변경을 되돌리지 않게(더미는 탭마다).
 *   - 저장하지 않는다(이미 저장소에 있다) · 이름바꾸기 입력·고르기는 그대로(사라진 노드만 비운다).
 */
function applyRemote(r: RemoteNodes): void {
    if (state.loading) return;   // 로드가 끝나면 저장소를 통째로 읽는다
    const cur = state.tree;
    const upsert = new Map<string, Node>();
    const gone = new Set<string>();
    for (const [id, n] of r.nodes) {
        if (id === cur.root || id === cur.trash) { if (n) upsert.set(id, n); continue; }
        if (n) upsert.set(id, n); else if (cur.nodes[id]) gone.add(id);
    }
    if (r.full) {
        for (const id of Object.keys(cur.nodes)) {
            if (id === cur.root || id === cur.trash) continue;
            if (!r.nodes.has(id) && !isPendingLocal(id)) gone.add(id);
        }
    }
    const patch = (t: Tree): Tree => {
        const nodes = { ...t.nodes };
        for (const [id, n] of upsert) {
            const local = cur.nodes[id];
            nodes[id] = local ? { ...n, collapsed: local.collapsed } : n;
        }
        for (const id of gone) delete nodes[id];
        return { ...t, nodes };
    };
    const merged = normalize(patch(cur));
    if (diffIds(cur, merged).length === 0) return;
    const next: Tree = { ...merged, rev: cur.rev + 1 };
    const history = { past: state.history.past.map(patch), future: state.history.future.map(patch) };
    const alive = (id: string | null) => (id && next.nodes[id] ? id : null);
    const selectedIds = state.selectedIds.filter((id) => next.nodes[id] || id.includes('/'));
    state = {
        ...state, tree: next, history, selectedIds,
        selectedId: state.selectedId && selectedIds.includes(state.selectedId) ? state.selectedId : (selectedIds[selectedIds.length - 1] ?? null),
        renamingId: alive(state.renamingId) ?? (state.renamingId?.includes('/') ? state.renamingId : null),
        purgeConfirmId: alive(state.purgeConfirmId),
    };
    rebasePending(next);
    emit();
    fireChange(cur, next);
}

// ─────────────────────────── 구독 ───────────────────────────

export function useExplorer(): ExplorerState {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        () => state,
        () => state,
    );
}

/** 상태가 바뀔 때마다 부른다(React 밖 — 선택 알림 다리가 쓴다). */
export function subscribeState(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

export function getState(): ExplorerState {
    return state;
}

// ─────────────────────────── 선택·이름바꾸기 상태 ───────────────────────────

/** 하나만 고른다(맨 클릭·화살표·우클릭·바깥 클릭 해제). 🔴 멀티 선택을 한 개로 접는다. */
export function select(id: string | null): void {
    if (state.selectedId === id && state.selectedIds.length === (id ? 1 : 0)) return;
    state = { ...state, ...singleSel(id) };
    emit();
}

/** 지금 선택을 Selection 꼴로 — 순수 계산기(applyClick·selectAll)에 넘긴다. */
function curSel(): Selection {
    return { ids: state.selectedIds, anchorId: state.anchorId, focusId: state.selectedId };
}

/** 누르기 한 번(Ctrl/⌘ 토글·Shift 범위·맨 클릭)을 선택에 반영 — rowsOrder 는 보이는 줄 id 순서. */
export function clickSelect(id: string, rowsOrder: string[], mods: { ctrl?: boolean; shift?: boolean }): void {
    const next = applyClickSel(curSel(), rowsOrder, id, mods);
    state = { ...state, selectedIds: next.ids, anchorId: next.anchorId, selectedId: next.focusId };
    emit();
}

/** 보이는 줄 전부(Ctrl/⌘+A). */
export function selectAllRows(rowsOrder: string[]): void {
    const next = selectAllSel(rowsOrder);
    if (next.ids.length === 0) return;
    state = { ...state, selectedIds: next.ids, anchorId: next.anchorId, selectedId: next.focusId };
    emit();
}

export function startRename(id: string): void {
    state = { ...state, ...singleSel(id), renamingId: id, renameKind: 'name', renameInitial: null, renamePlaceholder: null };
    emit();
}

/**
 * 🔑 인라인 입력 띄우기 — 이름바꾸기가 아니라 「값 입력」(kind). 커밋하면 그 타입의 onInput(kind, 값) 으로 넘어간다.
 *   promptInput(공개 API)·newNode(createInput 타입)가 부른다. initial 은 미리 채울 값(빈 칸이면 '').
 */
export function startInput(id: string, kind: string, initial: string, placeholder: string | null): void {
    if (state.loading) return;
    state = { ...state, ...singleSel(id), renamingId: id, renameKind: kind, renameInitial: initial, renamePlaceholder: placeholder };
    emit();
}

/** 🔑 방금 만든 노드 — 이름 정하기가 끝나면(확정·취소 모두) 활성 칸에 연다(노션 방식). createInput 타입은 해당 없음. */
let pendingOpenId: string | null = null;
/** 새로 만든 노드가 열릴 때 초점 줄 칸 — 페이지는 제목(전체 선택), 시트는 A1 격자. */
export const FOCUS_ON_OPEN: Record<string, { selector: string; select: boolean }> = {
    'page.page': { selector: 'input[aria-label="페이지 제목"]', select: true },
    'sheet.sheet': { selector: '[data-testid="table-grid"]', select: false },
    'timetable-grid.sheet': { selector: '[role="grid"][aria-label="시간표 칸"]', select: false },
};
function openIfPending(id: string): void {
    if (pendingOpenId !== id) return;
    pendingOpenId = null;
    const type = state.tree.nodes[id]?.type;
    openById(id);
    // #49 — 새로 만든 페이지·시트도 열릴 때 초점이 BODY 에 남지 않게(시작 화면 경로와 같은 칸)
    const sel = type && FOCUS_ON_OPEN[type];
    if (sel) focusWhenReady(sel.selector, sel.select);
}

export function cancelRename(): void {
    if (state.renamingId == null) return;
    const rid = state.renamingId;
    state = { ...state, renamingId: null, renameKind: 'name', renameInitial: null, renamePlaceholder: null };
    emit();
    openIfPending(rid);
}

/**
 * 인라인 입력 확정 — 어느 쪽이든 input 은 닫는다.
 *   · renameKind === 'name' → 노드 이름을 바꾼다(비면 model/tree.rename 이 원래 이름을 지킨다).
 *   · 그 외 → 그 노드 타입의 onInput(kind, 값) 으로 넘긴다(⛔ 탐색기는 그 값의 뜻을 모른다 — 타입 주인이 푼다).
 */
export function commitRename(value: string): void {
    const id = state.renamingId;
    if (!id) return;
    const kind = state.renameKind;
    if (kind === 'name') {
        apply((t) => rename(t, id, value, permitRename), { patch: { renamingId: null, renameKind: 'name', renameInitial: null, renamePlaceholder: null } });
        openIfPending(id);
        return;
    }
    // 값 입력 — 입력을 먼저 닫고(재진입 방지) 타입에게 넘긴다.
    const def = getType(state.tree.nodes[id]?.type ?? '');
    state = { ...state, renamingId: null, renameKind: 'name', renameInitial: null, renamePlaceholder: null };
    emit();
    try { def?.onInput?.(id, kind, value); } catch { /* 타입 핸들러가 던져도 입력은 이미 닫혔다 */ }
}

// ─────────────────────────── 구조 연산(명령이 부른다) ───────────────────────────

/** 이 부모가 이 타입을 자식으로 받나 — 실노드 + 등록 표(acceptsChild) 한 줄. */
function parentAccepts(parentId: string, type: string): boolean {
    const p = state.tree.nodes[parentId];
    return !!p && acceptsChild(p.type, type, parentId);
}

/**
 * 🔑 자동 슬롯 — 방금 만든 노드(parentId · parentType)의 slots 타입마다 자식을 만든다(재귀 — 슬롯의 슬롯까지).
 *   🔴 바깥 apply 안에서 부모 생성과 한 묶음으로 돈다(되돌리기 한 번에 전부). 순수하지 않다(uid) — model 밖(store)에 둔다.
 *   - accepts 가 막거나 싱글톤에 걸려 안 생긴 슬롯은 조용히 건너뛴다(그 자식의 슬롯도 안 판다).
 *   - seen: 타입 사이클(제 슬롯 체인이 자신을 다시 부름) 방지 — 한 번 판 타입은 다시 안 판다(종료 보장).
 */
function createSlots(tree: Tree, parentId: string, parentType: string, seen: Set<string>): Tree {
    if (seen.has(parentType)) return tree;
    seen.add(parentType);
    let x = tree;
    for (const slotType of slotsOf(parentType)) {
        if (!acceptsChild(parentType, slotType)) continue;        // 부모가 못 받는 슬롯 타입 — 건너뛴다
        const def = getType(slotType);
        const init = def?.create?.init?.(parentId) ?? {};
        const name = typeof init.name === 'string' ? init.name : (def?.create?.label ?? def?.label ?? slotType);
        const sid = uid();
        const before = x;
        x = createNode(x, parentId, { id: sid, type: slotType, name, data: init.data }, uniqueOf);
        if (x === before) continue;                               // 안 생겼으면(싱글톤 등) 그 슬롯의 슬롯도 건너뛴다
        x = createSlots(x, sid, slotType, seen);                  // 슬롯의 슬롯
    }
    return x;
}

/**
 * 타입 하나를 「새로 만들기」 — 만들자마자 고르고 이름바꾸기(VS Code 식). 🔴 타입 이름 비교가 없다 —
 *   create.init 과 label 은 등록 표에서 온다. 「새 폴더」도 이 길을 탄다(folder 도 표의 한 줄).
 *   🔴 부모는 newFolderParent(via) 가 정한다 — 두 경로(쥔님 2026-11-02):
 *      - via 'selection'(기본 · 헤더 단추·팔레트·단축키): 고른 노드의 **형제로**(⛔ 고른 폴더 안으로 안 들어간다).
 *      - via 'context'(우클릭): targetId(우클릭한 노드)가 컨테이너면 그 안, 파일이면 그 부모.
 *   🔴 마지막에 그 부모가 accepts 로 이 타입을 받는지 한 번 더 묻는다: 안 받으면 루트에, 루트도 안 받으면 만들지 않고
 *      상태바 한 줄(메뉴만 보고 뚫는 것을 여기서 막는다 — move 의 canAccept 와 같은 결).
 */
export function newNode(type: string, opts?: { via?: 'selection' | 'context'; targetId?: string; openNow?: boolean }): void {
    if (state.loading) return;
    const via = opts?.via ?? 'selection';
    const basis = opts?.targetId !== undefined ? opts.targetId : state.selectedId;
    let parent = isSectionType(type) ? state.tree.root : newFolderParent(state.tree, basis, isContainerType, via);   // 섹션은 늘 뿌리 밑
    if (!parentAccepts(parent, type)) {
        if (parentAccepts(state.tree.root, type)) {
            parent = state.tree.root;
        } else {
            const def = getType(type);
            flashNotice(`「${def?.create?.label ?? def?.label ?? type}」를 넣을 자리가 없습니다.`);
            return;
        }
    }
    // 🔑 「만들기」 가림 사전점검 — 모델 관문(createNode 의 canCreate)이 막기 전에 이유를 알린다(메뉴 회색과 같은 판정).
    if (!canCreateType(type, parent)) {
        const d = getType(type);
        flashNotice(`「${d?.create?.label ?? d?.label ?? type}」를 여기에 만들 수 없습니다.`);
        return;
    }
    // 🔑 싱글톤 사전점검 — 모델 관문(createNode 의 uniqueOf)이 막기 전에 이유를 알린다(메뉴 회색과 같은 판정).
    if (violatesUnique(state.tree, type, parent, null, uniqueOf)) {
        const d = getType(type);
        flashNotice(`「${d?.create?.label ?? d?.label ?? type}」는 이미 있습니다.`);
        return;
    }
    const def = getType(type);
    const init = def?.create?.init?.(parent) ?? {};
    const id = uid();
    const name = typeof init.name === 'string' ? init.name : (def?.create?.label ?? def?.label ?? '새 항목');
    // 🔑 createInput 타입이면 이름칸 자리에 「값 입력」(kind:'create')을 띄운다 — 커밋은 onInput 으로(이름이 아니라 링크 등).
    const ci = def?.createInput;
    const inputPatch = ci
        ? { renameKind: 'create', renameInitial: '', renamePlaceholder: ci.placeholder ?? null }
        : { renameKind: 'name', renameInitial: null, renamePlaceholder: null };
    // 🔑 openNow(빈 탐색기 처음 단추) — 이름칸을 안 띄우고 만들자마자 가운데 탭에 연다(이름은 열린 화면에서). createInput 타입은 값 입력이 필요해 기존 길.
    const openNow = !!opts?.openNow && !ci;
    pendingOpenId = ci || openNow ? null : id;
    apply(
        (t) => {
            const made = createNode(t, parent, { id, type, name, data: init.data }, uniqueOf, permitCreate);
            if (made === t) return t;                                     // 관문에 막힘(이론상 위에서 걸러짐)
            return createSlots(made, id, type, new Set());                // 🔑 자동 슬롯 — 한 묶음(되돌리기 한 번)
        },
        { patch: openNow ? { ...singleSel(id) } : { ...singleSel(id), renamingId: id, ...inputPatch } },
    );
    if (openNow && state.tree.nodes[id]) {
        openById(id);
        const sel = FOCUS_ON_OPEN[type];
        if (sel) focusWhenReady(sel.selector, sel.select);
    }
}

/**
 * 새 폴더 — newNode('folder') 의 설탕. parentId 를 주면 그 노드 안에 바로(via 'context' 로 그 노드를 target 삼는다 —
 *   폴더면 그 안), 없으면 헤더 단추처럼 「고른 것 기준」(via 'selection').
 */
export function newFolder(parentId?: string): void {
    if (parentId !== undefined) newNode('folder', { via: 'context', targetId: parentId });
    else newNode('folder', { via: 'selection' });
}

/** 고른 노드 이름 바꾸기 시작(F2·메뉴). 🔴 하나일 때만(여럿 고르면 이름 바꾸기는 비활성) · 루트·휴지통은 못 바꾼다. */
export function renameSelected(): void {
    if (state.selectedIds.length !== 1) return;
    const id = state.selectedId;
    if (!id || id === state.tree.root || id === state.tree.trash) return;
    startRename(id);
}

/**
 * 고른 노드 전부 삭제 → 휴지통(메뉴·Delete). 🔴 한 번의 apply = 한 묶음(Ctrl+Z 한 번에 전부 복원).
 *   조상-자손이 같이 고쳤으면 조상만 옮긴다(topmostOnly — 자손은 따라간다). 지운 뒤 선택은 해제.
 */
export function removeSelected(): void {
    const ids = state.selectedIds.filter((id) => id !== state.tree.root && id !== state.tree.trash && state.tree.nodes[id]);
    if (ids.length === 0) return;
    // 🔑 can.delete 로 지울 수 있는 것만(메뉴는 이미 회색이지만 단축키·멀티 선택 대비). 🔴 하나도 못 지우면 까닭을 알린다(Q5-C — 조용히 안 되는 것 금지).
    const deletable = topmostOnly(state.tree, ids).filter((id) => {
        const n = state.tree.nodes[id];
        return !!n && canDo(n.type, id, 'delete');
    });
    if (deletable.length === 0) { flashNotice('지울 수 없는 노드입니다 — 지금 계정에 삭제 권한이 없거나 고정된 구조물입니다.'); return; }
    // 🔑 confirmDelete — 지울 것 중 하나라도 노드 타입이 경고를 요청하면 먼저 인라인으로 묻는다(⛔ window.confirm 안 씀).
    const msg = deletable
        .map((id) => { const n = state.tree.nodes[id]; return n ? confirmDeleteMsg(n.type, id) : null; })
        .find((m): m is string => !!m);
    if (msg) { state = { ...state, deleteConfirm: { ids: deletable, msg } }; emit(); return; }
    doRemove(deletable);
}

/** 실제 삭제 — can.delete 통과분을 휴지통으로(한 묶음). removeSelected 와 confirmRemove 가 공유한다. */
function doRemove(ids: string[]): void {
    const top = topmostOnly(state.tree, ids);
    const what = top.length === 1 ? `「${state.tree.nodes[top[0]]?.name ?? ''}」` : `${top.length}개`;
    apply((t) => {
        let x = t;
        for (const id of topmostOnly(t, ids)) x = remove(x, id, permitDelete, isSectionType);
        return x;
    }, { patch: { ...singleSel(null), renamingId: null, deleteConfirm: null } });
    // 🔔 「되돌리기」가 붙은 알림 — 명령 id 로만(함수 금지). 연달아 지워도 토스트는 한 건에 덮인다.
    //   🔴 args.undoTop = 이 삭제가 쌓은 더미 칸의 토큰(C1) — 뒤에 다른 작업이 쌓이면 enabled 가 false 라 옛 알림이 남의 작업을 안 되돌린다.
    const token = undoToken();
    if (hostRef) notifyUndo(hostRef, { title: `${josa(what, '을/를')} 휴지통으로 옮겼습니다`, key: 'explorer.trashed', commandId: CMD.undo, args: token === null ? null : { undoTop: token } });
}

/** 노드 틀(⋯ 메뉴)의 「휴지통으로」 — 선택과 무관하게 이 노드만. can.delete 는 여기서 한 번 더 거른다(경고 문구는 틀이 먼저 물었다). */
export function trashNode(id: string): void {
    const n = state.tree.nodes[id];
    if (!n || id === state.tree.root || id === state.tree.trash || !canDo(n.type, id, 'delete')) return;
    doRemove([id]);
}

/** 인라인 「지울까요?」 확정 — confirmDelete 경고를 받아들여 지운다. */
export function confirmRemove(): void {
    const c = state.deleteConfirm;
    if (!c) return;
    doRemove(c.ids);
}

/** 인라인 「지울까요?」 취소 — 경고 줄을 닫는다(아무것도 안 지운다). */
export function cancelRemove(): void {
    if (!state.deleteConfirm) return;
    state = { ...state, deleteConfirm: null };
    emit();
}

/** 접기/펴기 토글 — 화살표·오른쪽/왼쪽 화살표 키가 쓴다. ⛔ 더미에 안 쌓는다(접힘은 되돌릴 값 아님). */
export function toggle(id: string): void {
    apply((t) => toggleCollapse(t, id), { history: 'skip' });
}

/** 옮기기(하나) — accepts·싱글톤·can.move 를 move 에 주입한다(마지막 관문). */
export function moveNode(id: string, parentId: string, index?: number): void {
    apply((t) => move(t, id, parentId, index, acceptsChild, uniqueOf, permitMove));
}

/**
 * 옮기기(여럿) — 고른 것 전부를 순서대로. 🔴 조상-자손이 같이 고쳤으면 조상만(topmostOnly · 자손은 따라간다).
 *   한 번의 apply = 한 묶음. index 를 주면 그 자리부터 차례로 꽂는다(순서 유지).
 */
export function moveNodes(ids: string[], parentId: string, index?: number): void {
    if (ids.length === 0) return;
    apply((t) => {
        let x = t;
        let at = index;
        for (const id of topmostOnly(t, ids)) {
            x = move(x, id, parentId, at, acceptsChild, uniqueOf, permitMove);
            if (at != null) at += 1;
        }
        return x;
    });
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

// ─────────────────────────── 휴지통(N3) ───────────────────────────

/** 복원 — 고른(휴지통 안) 노드 전부를 원래 부모(살아 있으면)로, 아니면 루트로. 🔴 한 묶음(Ctrl+Z 한 번). */
export function restoreSelected(): void {
    const ids = state.selectedIds.filter((id) => state.tree.nodes[id] && isDescendant(state.tree, id, state.tree.trash));
    if (ids.length === 0) return;
    // 🔑 싱글톤 충돌 — 복원하면 규칙을 깨는 것은 거절하고 이유를 알린다(휴지통은 안 세니 복원 때 충돌이 난다).
    //    막힌 것은 restore(uniqueOf) 가 그대로 두고(휴지통에 남는다), 안 막힌 것만 복원된다.
    const blocked = topmostOnly(state.tree, ids).filter((id) => {
        const n = state.tree.nodes[id];
        return !!n && violatesUnique(state.tree, n.type, restoreDest(state.tree, id), id, uniqueOf);
    });
    if (blocked.length) {
        const names = blocked.map((id) => state.tree.nodes[id]?.name ?? '?').join(', ');
        flashNotice(`복원할 수 없습니다 — 이미 있습니다: ${names}`);
    }
    apply((t) => {
        let x = t;
        for (const id of topmostOnly(t, ids)) x = restore(x, id, uniqueOf);
        return x;
    }, { patch: { ...singleSel(ids[0]) } });
}

/** 인라인 「정말 지울까요?」 켜기 — 고른(또는 준) 휴지통 노드에. 🔴 그 하나만 고른 꼴로(영구삭제는 줄별 확인). */
export function askPurge(id?: string): void {
    const target = id ?? state.selectedId;
    if (!target || !state.tree.nodes[target]) return;
    if (!isDescendant(state.tree, target, state.tree.trash)) return;
    state = { ...state, ...singleSel(target), purgeConfirmId: target, purgeAllConfirm: false };
    emit();
}

/** 인라인 「휴지통 비우기」 확인 켜기. */
export function askPurgeAll(): void {
    if ((state.tree.nodes[state.tree.trash]?.children.length ?? 0) === 0) return;
    state = { ...state, purgeAllConfirm: true, purgeConfirmId: null };
    emit();
}

/** 확인 취소 — 두 인라인 확인 모두 닫는다. */
export function cancelPurgeConfirm(): void {
    if (state.purgeConfirmId == null && !state.purgeAllConfirm) return;
    state = { ...state, purgeConfirmId: null, purgeAllConfirm: false };
    emit();
}

/** 🔴 영구 삭제 확정 — purgeConfirmId 노드를 가지째. ⛔ 못 되돌림 → 더미 비운다(history: 'clear'). */
export function purgeConfirmed(): void {
    const id = state.purgeConfirmId;
    if (!id) return;
    const ids = state.selectedIds.filter((x) => x !== id);
    const focus = state.selectedId === id ? (ids[ids.length - 1] ?? null) : state.selectedId;
    apply((t) => purge(t, id), {
        history: 'clear',
        patch: { purgeConfirmId: null, selectedIds: ids, selectedId: focus, anchorId: state.anchorId === id ? focus : state.anchorId },
    });
}

/** 🔴 휴지통 비우기 확정. ⛔ 못 되돌림 → 더미 비운다. */
export function purgeAllConfirmed(): void {
    if (!state.purgeAllConfirm) return;
    apply((t) => purgeAll(t), { history: 'clear', patch: { purgeAllConfirm: false, ...singleSel(null) } });
}

// ─────────────────────────── 되돌리기/다시하기(N3) ───────────────────────────

/**
 * 되돌리기 더미 맨 위 칸의 토큰 — 그 칸(바꾸기 직전 나무)의 rev. 비었으면 null.
 *   rev 는 apply·undo·redo 마다 오르니 칸마다 다르다 — 「지금 맨 위가 그 작업이 쌓은 칸인가」를 이걸로 가린다(C1).
 */
export function undoToken(): number | null {
    const p = state.history.past;
    return p.length > 0 ? p[p.length - 1].rev : null;
}

/** 이 맥락으로 되돌려도 되나 — args.undoTop 이 있으면 지금 맨 위 토큰과 맞을 때만(알림의 낡은 단추 막기). 없으면 늘 된다. */
export function undoAllowed(args: unknown): boolean {
    if (!args || typeof args !== 'object' || !('undoTop' in args)) return args !== null;
    return (args as { undoTop: unknown }).undoTop === undoToken();
}

/** 되돌리기 — 더미 과거의 맨 뒤 상태로. rev 는 저장용으로만 올린다. */
export function undoAction(): void {
    const r = undoHist(state.history, state.tree);
    if (!r) return;
    const prev = state.tree;
    const bumped: Tree = { ...r.value, rev: state.tree.rev + 1 };
    state = { ...state, tree: bumped, history: r.history, renamingId: null, purgeConfirmId: null, purgeAllConfirm: false };
    // 🔴 양방향 diffIds — 되돌리면 되살아난(prev 에 없고 bumped 에 있는) 노드도 센다 → put 된다.
    if (hostRef) saveTree(hostRef, bumped, diffIds(prev, bumped));
    emit();
    fireChange(prev, bumped);
}

// ─────────────────────────── 공개 API 창구(N4 · api.ts 가 부른다) ───────────────────────────
// 🔴 이 아래는 다른 플러그인이 NodesApi 로 부르는 길이다. UI 상태(고르기·이름바꾸기)를 안 건드린다 —
//    createUnder/removeSelected 같은 UI 함수와 달리 「고른 노드」에 기대지 않고 id 를 직접 받는다.

/** 노드 하나 만들기 — 새 id 를 돌려준다. 부모가 없으면 빈 문자열(안 만든다). */
export function apiCreate(
    parentId: string,
    opts: { type: string; name: string; data?: unknown; index?: number },
): string {
    if (state.loading) return '';   // 🔴 로딩 중엔 안 만든다(apply 가 막히니 가짜 id 를 돌려주지 않게)
    if (!state.tree.nodes[parentId]) return '';
    if (!canCreateType(opts.type, parentId)) return '';   // 🔑 「만들기」 가림 — 안 만든다(빈 id)
    if (violatesUnique(state.tree, opts.type, parentId, null, uniqueOf)) return '';   // 🔑 싱글톤 — 안 만든다(빈 id)
    const id = uid();
    apply((t) => {
        const made = createNode(t, parentId, { id, type: opts.type, name: opts.name, data: opts.data, index: opts.index }, uniqueOf, permitCreate);
        if (made === t) return t;
        return createSlots(made, id, opts.type, new Set());   // 🔑 자동 슬롯 — 부모 생성과 한 묶음
    });
    return state.tree.nodes[id] ? id : '';   // 실제로 생겼을 때만 id(관문에 막혔으면 빈 문자열)
}

/**
 * 🔑 묶음 — fn 안의 모든 연산이 되돌리기 한 칸 · 저장 한 번 · 알림 한 번이 된다(붙여넣기 100행 = ⌘Z 한 번).
 *   중첩이면 바깥 묶음에 합쳐진다. fn 이 던져도 지금까지의 변경은 한 칸으로 마감한 뒤 던진다.
 */
export function apiBatch(fn: () => void): void {
    if (state.loading) return;
    if (batchDepth > 0) { fn(); return; }
    const base = state.tree;
    batchDepth = 1;
    try { fn(); } finally {
        batchDepth = 0;
        const next = state.tree;
        if (next !== base) {
            state = { ...state, history: record(state.history, base) };
            if (hostRef) saveTree(hostRef, next, diffIds(base, next));
            emit();
            fireChange(base, next);
        }
    }
}

export function apiRename(id: string, name: string): void {
    if (!state.tree.nodes[id]) return;
    apply((t) => rename(t, id, name, permitRename));
}

export function apiMove(id: string, parentId: string, index?: number): void {
    apply((t) => move(t, id, parentId, index, acceptsChild, uniqueOf, permitMove));
}

/** 휴지통으로(영구삭제 아님) — API 엔 purge 가 없다(사람만 비운다). */
export function apiRemove(id: string): void {
    if (!state.tree.nodes[id]) return;
    apply((t) => remove(t, id, permitDelete, isSectionType));
}

/** 불투명 data 쓰기 — 🔴 주인(타입 접두사) 검사는 api.ts 가 하고, 여기선 모델만 바꾼다. */
export function apiSetData(id: string, data: unknown): void {
    if (!state.tree.nodes[id]) return;
    apply((t) => setDataTree(t, id, data));
}

/** 공통 머리 칸 쓰기 — 주인 검사 없음(사람 글 · 되돌리기 더미에 쌓인다). 본문 속은 page-doc 주인만 안다. */
export function apiSetField(id: string, key: 'icon' | 'body', value: unknown): void {
    if (!state.tree.nodes[id]) return;
    apply((t) => setField(t, id, key, value));
}

/** 유도 자식 다시 계산 — 그 노드 캐시만 버리고 다시 그리게 한다(나무는 안 바뀐다). */
export function apiInvalidate(id: string): void {
    invalidateDerived(id);
    // 🔴 새 state 참조 — 같은 참조로 emit 하면 useSyncExternalStore 가 다시 그리기를 건너뛴다(로그인 뒤 숨김·만들기 판정이 굳던 원인 · P4d A1)
    state = { ...state };
    emit();
}

/**
 * 그 노드를 「연다」 — 실노드는 등록 타입의 open, 유도(가상 `<부모>/<key>`)는 부모를 derive 해 그 key 의 타입으로.
 *   🔴 한 단계 중첩까지(부모가 실노드일 때). 컨테이너(폴더 역할)는 여기서 안 연다 — 그건 뷰의 접기/펴기다.
 */
export function openById(id: string): void {
    const t = state.tree;
    const real = t.nodes[id];
    if (real) { openType(real.type, id); return; }
    const slash = id.lastIndexOf('/');
    if (slash < 0) return;
    const parentId = id.slice(0, slash);
    const pnode = t.nodes[parentId];
    if (!pnode) return;
    const pdef = getType(pnode.type);
    if (!pdef?.derive) return;
    const der = getDerived(pnode, pdef);
    const v = der.children.find((c) => c.key === id.slice(slash + 1));
    if (v?.openable && v.type) openType(v.type, id);
}

/** 다시하기 — 더미 미래의 맨 앞 상태로. */
export function redoAction(): void {
    const r = redoHist(state.history, state.tree);
    if (!r) return;
    const prev = state.tree;
    const bumped: Tree = { ...r.value, rev: state.tree.rev + 1 };
    state = { ...state, tree: bumped, history: r.history, renamingId: null, purgeConfirmId: null, purgeAllConfirm: false };
    if (hostRef) saveTree(hostRef, bumped, diffIds(prev, bumped));
    emit();
    fireChange(prev, bumped);
}
