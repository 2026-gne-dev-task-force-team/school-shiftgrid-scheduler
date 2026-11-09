/**
 * 싱글톤 + 자동 슬롯 — 스토어·API·메뉴 배선 증명(설계 「싱글톤 노드 타입」 · 쥔님 확정 2026-11-08).
 *   관문은 모델 한 곳(violatesUnique)이고, 여기선 그 관문이 만들기·옮기기·복원·API 의 모든 창구에 걸렸나를 본다.
 *   store 가 비동기 로드라 노드 스토어(kv)를 메모리로 모킹하고 initStore 로 loading 을 푼다(multi-select.test 와 같은 결).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';

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
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import {
    initStore, getState, newNode, select,
    removeSelected, undoAction,
    apiCreate, apiMove,
} from './store';
import { __resetPersistForTest } from './persist';
import { registerType, clearTypes, uniqueOf, createCandidates } from './model/types';
import { clearDerived } from './model/derive';
import { parentOf, isDescendant, violatesUnique, newFolderParent } from './model/tree';
import { isContainerType } from './model/types';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    // 내장 폴더 + 두 싱글톤 타입 + 슬롯을 가진 부모 타입을 꽂는다.
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
    // 'app.info' — 나무에 하나(학교 정보). 폴더가 받는다.
    registerType({ type: 'app.info', label: '학교 정보', icon: 'file', unique: 'tree', create: { label: '학교 정보' } });
    // 'app.list' — 부모마다 하나(선생님 목록). 폴더가 받는다.
    registerType({ type: 'app.list', label: '목록', icon: 'folder', container: true, unique: 'parent', create: { label: '목록' } });
    // 'app.timetable' — 만들면 슬롯(목록·규칙)을 같이 만든다. 슬롯 'app.rule' 은 스스로 못 지우게(can) · parent 유일.
    registerType({
        type: 'app.timetable', label: '시간표', icon: 'calendar', container: { accepts: ['app.list', 'app.rule', 'folder'] },
        slots: ['app.list', 'app.rule'], create: { label: '시간표' },
    });
    registerType({ type: 'app.rule', label: '규칙', icon: 'file', unique: 'parent', can: { delete: false, rename: false }, create: { label: '규칙' } });
});
afterEach(() => { __resetPersistForTest(); clearTypes(); });

const root = () => getState().tree.root;
const countType = (type: string): number => Object.values(getState().tree.nodes).filter((n) => n.type === type).length;

// 루트에 노드 하나 만들고 그 id — newNode 는 selection 경로(루트 선택 없으면 루트에).
function makeAtRoot(type: string): string {
    select(null);
    newNode(type);
    return getState().selectedId!;
}

// ─────────────────────────── newNode(만들기) 관문 ───────────────────────────

describe('newNode — 싱글톤은 둘째가 안 생긴다', () => {
    it("'tree' — 학교 정보는 나무에 하나만", () => {
        makeAtRoot('app.info');
        expect(countType('app.info')).toBe(1);
        // 폴더를 하나 만들고 그 안에서 또 만들어도(다른 부모) 나무 전체 규칙이라 안 생긴다.
        const f = makeAtRoot('folder');
        select(f);
        newNode('app.info', { via: 'context', targetId: f });
        expect(countType('app.info')).toBe(1);
    });

    it("'parent' — 목록은 부모마다 하나(다른 폴더엔 또 만든다)", () => {
        const f1 = makeAtRoot('folder');
        const f2 = makeAtRoot('folder');
        newNode('app.list', { via: 'context', targetId: f1 });
        newNode('app.list', { via: 'context', targetId: f1 });   // f1 둘째 — 거부
        expect(getState().tree.nodes[f1].children.filter((c) => getState().tree.nodes[c].type === 'app.list').length).toBe(1);
        newNode('app.list', { via: 'context', targetId: f2 });   // f2 — ok
        expect(countType('app.list')).toBe(2);
    });
});

// ─────────────────────────── API 관문 ───────────────────────────

describe('apiCreate / apiMove — 같은 관문', () => {
    it('apiCreate 는 둘째를 안 만들고 빈 id 를 돌려준다', () => {
        const id1 = apiCreate(root(), { type: 'app.info', name: '정보' });
        expect(id1).not.toBe('');
        const id2 = apiCreate(root(), { type: 'app.info', name: '정보2' });
        expect(id2).toBe('');                 // 🔑 안 만들어졌으니 빈 id
        expect(countType('app.info')).toBe(1);
    });

    it('apiMove 는 이미 그 타입이 있는 부모로 못 옮긴다', () => {
        const f1 = apiCreate(root(), { type: 'folder', name: 'f1' });
        const f2 = apiCreate(root(), { type: 'folder', name: 'f2' });
        const l1 = apiCreate(f1, { type: 'app.list', name: '목록1' });
        const l2 = apiCreate(f2, { type: 'app.list', name: '목록2' });
        apiMove(l2, f1);                       // f1 엔 이미 l1 → 거부
        expect(parentOf(getState().tree, l2)).toBe(f2);
        void l1;
    });
});

// ─────────────────────────── 복원 관문 ───────────────────────────

describe('싱글톤(tree) — 탐색기에서 못 지운다(쥔님 2026-11-09 「실수로 지운다」)', () => {
    it("'tree' 노드는 지우기가 거절돼 휴지통에 안 간다", () => {
        const i1 = makeAtRoot('app.info');
        select(i1); removeSelected();
        expect(isDescendant(getState().tree, i1, getState().tree.trash)).toBe(false);
        expect(getState().tree.nodes[i1]).toBeDefined();
    });
});

// ─────────────────────────── 자동 슬롯 ───────────────────────────

describe('자동 슬롯 — 부모를 만들면 슬롯 자식도 같이', () => {
    it('시간표를 만들면 목록·규칙 슬롯이 같이 생긴다', () => {
        const tt = makeAtRoot('app.timetable');
        const kids = getState().tree.nodes[tt].children.map((c) => getState().tree.nodes[c].type).sort();
        expect(kids).toEqual(['app.list', 'app.rule']);
    });

    it('🔑 부모 생성 + 슬롯 생성 = 되돌리기 한 묶음(undo 한 번에 전부 사라진다)', () => {
        const before = countType('app.timetable') + countType('app.list') + countType('app.rule');
        const tt = makeAtRoot('app.timetable');
        expect(getState().tree.nodes[tt].children.length).toBe(2);
        undoAction();                                      // 🔑 한 번
        expect(getState().tree.nodes[tt]).toBeUndefined(); // 시간표가 사라졌다
        expect(countType('app.list')).toBe(0);             // 슬롯도 같이
        expect(countType('app.rule')).toBe(0);
        expect(countType('app.timetable') + countType('app.list') + countType('app.rule')).toBe(before);
    });

    it('apiCreate 로 만들어도 슬롯이 선다', () => {
        const tt = apiCreate(root(), { type: 'app.timetable', name: '1학년' });
        expect(getState().tree.nodes[tt].children.length).toBe(2);
    });

    it('슬롯이 parent 유일이라 두 번째 슬롯은 안 겹친다(시간표를 또 만들면 그 안에만 하나씩)', () => {
        makeAtRoot('app.timetable');
        makeAtRoot('app.timetable');
        // 시간표 둘, 각자 목록 하나·규칙 하나 → 목록 2·규칙 2
        expect(countType('app.timetable')).toBe(2);
        expect(countType('app.list')).toBe(2);
        expect(countType('app.rule')).toBe(2);
    });
});

// ─────────────────────────── 메뉴 회색(이미 있으면 비활성) ───────────────────────────

describe('메뉴 회색 — 이미 있으면 후보는 남되 violatesUnique 가 참(비활성 근거)', () => {
    it('학교 정보가 이미 있으면 「새 학교 정보」는 후보에 있고, 생길 자리에서 violatesUnique 가 참', () => {
        makeAtRoot('app.info');
        // 뷰가 메뉴를 짜는 것과 같은 계산: 후보 목록엔 그대로 있고(숨기지 않는다),
        const cands = createCandidates('folder').map((d) => d.type);
        expect(cands).toContain('app.info');
        // 생길 자리(루트 선택 없음 → context 부모는 루트)에서 위반 → 비활성.
        const ctxParent = newFolderParent(getState().tree, null, isContainerType, 'context');
        expect(violatesUnique(getState().tree, 'app.info', ctxParent, null, uniqueOf)).toBe(true);
    });

    it('아직 없으면 violatesUnique 가 거짓(활성)', () => {
        const ctxParent = newFolderParent(getState().tree, null, isContainerType, 'context');
        expect(violatesUnique(getState().tree, 'app.info', ctxParent, null, uniqueOf)).toBe(false);
    });
});
