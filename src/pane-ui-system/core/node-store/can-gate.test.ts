/**
 * 조작 가능 관문 — can(함수 꼴)·canCreate·confirmDelete·hidden 이 한 곳(canDo/canCreateType/confirmDeleteMsg/nodeHidden)으로
 *   모이고, 그 관문이 모델(createNode·rename·move·remove)·스토어(newNode·removeSelected·confirm)·공개 API 의
 *   모든 창구에 걸렸나를 본다(설계 「계정은 보이는 노드 · 권한의 첫 본보기」 · violatesUnique 와 같은 결).
 *   store 가 비동기 로드라 노드 스토어(kv)를 메모리로 모킹하고 initStore 로 loading 을 푼다(unique-slots.test 와 같은 결).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (batch: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (batch.clear) store.clear();
        for (const v of batch.put ?? []) store.set(v.id as string, v);
        for (const id of batch.del ?? []) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import {
    initStore, getState, newNode, select,
    removeSelected, confirmRemove, cancelRemove,
    apiCreate, apiMove, apiRemove, apiInvalidate, subscribeState,
} from './store';
import { __resetPersistForTest } from './persist';
import {
    registerType, clearTypes,
    canDo, canCreateType, confirmDeleteMsg, isHiddenNode, nodeHidden,
} from '../nodes/model/types';
import { clearDerived } from '../nodes/model/derive';
import { createNode, rename, move, remove, emptyTree, type Tree, type Node } from '../nodes/model/tree';
import type { CanFlags } from '../nodes/model/types';

const notified: { title: string; level?: string; key?: string }[] = [];
function host(): PluginHost {
    return {
        notify: Object.assign((i: { title: string; level?: string; key?: string }) => { notified.push(i); return 'n'; }, { dismiss: () => {} }),
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

// 🔴 「권한」 흉내 — 테스트가 flip 하는 모듈 전역(계정 플러그인이 permit.can 을 읽는 자리를 대신한다).
let allowed = true;

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear(); notified.length = 0;
    clearTypes(); clearDerived(); __resetPersistForTest();
    allowed = true;
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
    // 🔑 함수 꼴 can — 지금 권한(allowed)에 따라 그때그때 답한다(노드·상황 의존). canCreate 도 함수.
    registerType({
        type: 'acc.user', label: '사용자', icon: 'file',
        container: false,
        create: { label: '사용자' },
        can: (_id): CanFlags => ({ delete: allowed, move: allowed, rename: allowed }),
        canCreate: () => allowed,
        confirmDelete: (id) => `사용자 ${id} 를 지울까요?`,
        hidden: () => !allowed,
    });
    // 🔑 고정 객체 can(옛 꼴) — move 만 막는다(지우기는 됨). confirmDelete 는 고정 문자열.
    registerType({
        type: 'acc.root', label: '계정', icon: 'folder', container: { accepts: ['acc.user', 'folder'] },
        create: { label: '계정' },
        can: { move: false },
        confirmDelete: '계정을 지우면 안의 사용자·역할이 모두 휴지통으로 갑니다.',
    });
    // 내장 폴더엔 acc.root 를 받게 하려고 folder container:true 는 이미 전부 받는다.
});
afterEach(() => { __resetPersistForTest(); clearTypes(); });

const root = () => getState().tree.root;
const nodesOfType = (t: string): Node[] => Object.values(getState().tree.nodes).filter((n) => n.type === t);

// ─────────────────────────── 1) 등록 표 관문(canDo/canCreateType/confirmDeleteMsg/hidden) ───────────────────────────
describe('관문 한 곳 — canDo·canCreateType·confirmDeleteMsg·hidden', () => {
    it('canDo 함수 꼴 — allowed 에 따라 답이 바뀐다(노드·상황 의존)', () => {
        allowed = true;
        expect(canDo('acc.user', 'n1', 'delete')).toBe(true);
        expect(canDo('acc.user', 'n1', 'move')).toBe(true);
        allowed = false;
        expect(canDo('acc.user', 'n1', 'delete')).toBe(false);
        expect(canDo('acc.user', 'n1', 'rename')).toBe(false);
    });

    it('canDo 고정 객체 꼴 — move 만 false, 나머지 true', () => {
        expect(canDo('acc.root', 'r1', 'move')).toBe(false);
        expect(canDo('acc.root', 'r1', 'delete')).toBe(true);
        expect(canDo('acc.root', 'r1', 'rename')).toBe(true);
    });

    it('모르는 타입·can 없는 타입 — 전부 허용(기본 true)', () => {
        expect(canDo('folder', 'f1', 'delete')).toBe(true);
        expect(canDo('nope.unknown', 'x', 'move')).toBe(true);
    });

    it('canCreateType — 함수가 막으면 false, 없으면 true', () => {
        allowed = true;
        expect(canCreateType('acc.user', root())).toBe(true);
        allowed = false;
        expect(canCreateType('acc.user', root())).toBe(false);
        expect(canCreateType('folder', root())).toBe(true);   // canCreate 없으면 늘 true
    });

    it('confirmDeleteMsg — 고정 문자열·함수 둘 다 · 없으면 null', () => {
        expect(confirmDeleteMsg('acc.root', 'r1')).toContain('계정을 지우면');
        expect(confirmDeleteMsg('acc.user', 'n9')).toBe('사용자 n9 를 지울까요?');
        expect(confirmDeleteMsg('folder', 'f1')).toBeNull();
    });

    it('hidden/nodeHidden — allowed 면 보이고, 아니면 숨는다', () => {
        const un: Node = { id: 'u1', type: 'acc.user', name: '김', children: [] };
        allowed = true;
        expect(isHiddenNode(un)).toBe(false);
        expect(nodeHidden(un)).toBe(false);
        allowed = false;
        expect(isHiddenNode(un)).toBe(true);
        expect(nodeHidden(un)).toBe(true);
    });
});

// ─────────────────────────── 2) 모델 관문(순수 tree) ───────────────────────────
describe('모델 tree — 주입한 관문으로 createNode·rename·move·remove 를 막는다', () => {
    const permitCreate = (type: string, pid: string) => canCreateType(type, pid);
    const permitMove = (type: string, id: string) => canDo(type, id, 'move');
    const permitRename = (type: string, id: string) => canDo(type, id, 'rename');
    const permitDelete = (type: string, id: string) => canDo(type, id, 'delete');

    function seed(): Tree {
        let t = emptyTree();
        t = createNode(t, t.root, { id: 'r', type: 'acc.root', name: '계정' });
        t = createNode(t, 'r', { id: 'u', type: 'acc.user', name: '김' });
        return t;
    }

    it('createNode canCreate 막힘 → 나무 그대로(안 만든다)', () => {
        allowed = false;
        const t0 = seed();
        const t1 = createNode(t0, 'r', { id: 'u2', type: 'acc.user', name: '이' }, undefined, permitCreate);
        expect(t1).toBe(t0);                       // 안 바뀜
        expect(t1.nodes.u2).toBeUndefined();
    });

    it('rename canRename 막힘 → 이름 안 바뀜', () => {
        const t0 = seed();
        allowed = false;
        const t1 = rename(t0, 'u', '새이름', permitRename);
        expect(t1.nodes.u.name).toBe('김');
        allowed = true;
        const t2 = rename(t0, 'u', '새이름', permitRename);
        expect(t2.nodes.u.name).toBe('새이름');
    });

    it('move canMove 막힘 → 자리 그대로(acc.root 는 move:false)', () => {
        let t = seed();
        t = createNode(t, t.root, { id: 'f', type: 'folder', name: '폴더' });
        const before = t;
        const after = move(t, 'r', 'f', undefined, undefined, undefined, permitMove);
        expect(after).toBe(before);               // acc.root move:false → 안 움직인다
    });

    it('remove canDelete 막힘 → 안 지워짐 · 허용되면 휴지통으로', () => {
        const t0 = seed();
        allowed = false;
        const t1 = remove(t0, 'u', permitDelete);
        expect(t1).toBe(t0);                       // 못 지움
        allowed = true;
        const t2 = remove(t0, 'u', permitDelete);
        expect(t2.nodes.r.children).not.toContain('u');   // 휴지통으로 옮겨짐
        expect(t2.nodes.trash.children).toContain('u');
    });

    it('⭐ 지우기는 옮기기 권한이 아니다 — move:false 라도 지울 수 있다(remove 안쪽 move 엔 canMove 안 넘긴다)', () => {
        // acc.root 는 can.move=false, can.delete 는 기본 true.
        const t0 = seed();
        const t1 = remove(t0, 'r', permitDelete);
        expect(t1.nodes.trash.children).toContain('r');   // move:false 여도 삭제(휴지통행)는 된다
    });
});

// ─────────────────────────── 3) 스토어 관문(newNode·removeSelected·confirm·API) ───────────────────────────
describe('스토어·API — 모든 창구가 같은 관문을 지난다', () => {
    it('newNode canCreate 막힘 → 안 만들어진다(알림 warn)', () => {
        allowed = false;
        newNode('acc.user', { via: 'context', targetId: root() });
        expect(nodesOfType('acc.user').length).toBe(0);
        expect(notified.at(-1)).toMatchObject({ level: 'warn', key: 'explorer.blocked' });
        expect(notified.at(-1)?.title).toContain('만들 수 없');
    });

    it('newNode 허용 → 만들어진다', () => {
        allowed = true;
        newNode('acc.user', { via: 'context', targetId: root() });
        expect(nodesOfType('acc.user').length).toBe(1);
    });

    it('confirmDelete — removeSelected 는 바로 안 지우고 경고를 띄운다 · confirmRemove 로 지운다', () => {
        allowed = true;
        newNode('acc.user', { via: 'context', targetId: root() });
        const id = nodesOfType('acc.user')[0].id;
        select(id);
        removeSelected();
        expect(getState().deleteConfirm).not.toBeNull();
        expect(getState().deleteConfirm!.msg).toContain('지울까요');
        expect(getState().tree.nodes[id]).toBeTruthy();   // 아직 안 지워짐
        confirmRemove();
        expect(getState().deleteConfirm).toBeNull();
        expect(getState().tree.nodes[getState().tree.trash].children).toContain(id);   // 휴지통으로
    });

    it('cancelRemove — 경고를 닫고 아무것도 안 지운다', () => {
        allowed = true;
        newNode('acc.user', { via: 'context', targetId: root() });
        const id = nodesOfType('acc.user')[0].id;
        select(id);
        removeSelected();
        expect(getState().deleteConfirm).not.toBeNull();
        cancelRemove();
        expect(getState().deleteConfirm).toBeNull();
        expect(getState().tree.nodes[id]).toBeTruthy();   // 그대로 산다
    });

    it('removeSelected — can.delete false 면 안 지우고(확인 줄도 없음) 막힌 까닭을 알린다', () => {
        allowed = true;
        newNode('acc.user', { via: 'context', targetId: root() });
        const id = nodesOfType('acc.user')[0].id;
        select(id);
        allowed = false;             // 지금은 지울 권한 없음
        removeSelected();
        expect(getState().deleteConfirm).toBeNull();
        expect(getState().tree.nodes[id]).toBeTruthy();
        // 🔴 Q5-C — 조용히 안 되는 것 금지: 막힌 까닭이 알림으로 보인다
        expect(notified.at(-1)).toMatchObject({ level: 'warn', key: 'explorer.blocked' });
    });

    it('Q5-C — 싱글톤은 기본으로 못 지우지만, 타입 can 이 delete:true 를 명시하면 지운다(계정 루트·마스터)', () => {
        registerType({ type: 'acc.single', label: '단일', icon: 'file', unique: 'tree', create: { label: '단일' }, can: () => ({ delete: allowed }) });
        registerType({ type: 'acc.single2', label: '단일2', icon: 'file', unique: 'tree', create: { label: '단일2' } });
        allowed = true;
        expect(canDo('acc.single', 's', 'delete')).toBe(true);
        expect(canDo('acc.single2', 's', 'delete')).toBe(false);
        allowed = false;
        expect(canDo('acc.single', 's', 'delete')).toBe(false);
    });

    it('공개 API apiRemove — can.delete 관문을 지난다', () => {
        allowed = true;
        newNode('acc.user', { via: 'context', targetId: root() });
        const id = nodesOfType('acc.user')[0].id;
        allowed = false;
        apiRemove(id);
        expect(getState().tree.nodes[id]).toBeTruthy();   // can.delete false → 안 지워짐
        allowed = true;
        apiRemove(id);
        expect(getState().tree.nodes[getState().tree.trash].children).toContain(id);
    });

    it('공개 API apiMove — can.move 관문을 지난다', () => {
        allowed = true;
        // acc.root 아래 폴더 하나 + 사용자 하나를 만든다.
        newNode('acc.root', { via: 'context', targetId: root() });
        const rid = nodesOfType('acc.root')[0].id;
        newNode('folder', { via: 'context', targetId: rid });
        const fid = nodesOfType('folder').find((n) => n.id !== root())!.id;
        newNode('acc.user', { via: 'context', targetId: rid });
        const uid = nodesOfType('acc.user')[0].id;
        allowed = false;                       // can.move false
        apiMove(uid, fid);
        expect(getState().tree.nodes[rid].children).toContain(uid);   // 안 옮겨짐
        allowed = true;
        apiMove(uid, fid);
        expect(getState().tree.nodes[fid].children).toContain(uid);   // 옮겨짐
    });

    it('공개 API apiCreate — canCreate 막히면 빈 id', () => {
        allowed = false;
        const id = apiCreate(root(), { type: 'acc.user', name: '박' });
        expect(id).toBe('');
        expect(nodesOfType('acc.user').length).toBe(0);
    });
});

// ─────────────────────────── 4) 판정이 바뀌면 다시 그린다(P4d A1) ───────────────────────────
describe('invalidate — 나무는 그대로여도 가림 판정이 바뀌면 화면이 다시 센다', () => {
    it('apiInvalidate 는 새 state 참조로 알린다(같은 참조면 useSyncExternalStore 가 다시 그리기를 건너뛴다)', () => {
        // 로그인으로 권한이 바뀐 상황 — 노드는 안 바뀌고 계정 꾸러미가 nodes.invalidate 만 부른다
        const before = getState();
        let calls = 0;
        const off = subscribeState(() => { calls += 1; });
        allowed = false;
        apiInvalidate(root());
        off();
        expect(calls).toBe(1);
        expect(getState()).not.toBe(before);          // 🔴 새 참조여야 탐색기가 hidden/can 을 다시 센다
        expect(getState().tree).toBe(before.tree);    // 나무는 그대로(저장·되돌리기 churn 0)
    });
});
