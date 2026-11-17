/**
 * T-10g1 회귀 — 화면 길(시작 칸 「새로 만들기」=kit.createList · 「열기」 cmd)로 만든 시수표도 교사·반·과목 대상이 잡힌다.
 *   🔴 가짜 host 대신 진짜 레지스트리(activateAll)·진짜 PLUGINS 로 잰다 — 앞 판(T-10fw)은 탐색기 길(createInit)만 시험해 화면 길을 놓쳤다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    return {
        store,
        nodesGetAll: vi.fn(async (): Promise<unknown[] | null> => [...store.values()]),
        nodesWrite: vi.fn(async (batch: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
            if (batch.clear) store.clear();
            for (const v of batch.put ?? []) store.set(v.id as string, v);
            for (const id of batch.del ?? []) store.delete(id);
            return true;
        }),
    };
});
vi.mock('../../pane-ui-system/kv', async (importOriginal) => ({ ...(await importOriginal<object>()), nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { activateAll, setWorkspaceBridge } from '../../pane-ui-system/plugin';
import { initStore } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { CORE_PLUGINS } from '../../pane-ui-system/core';
import { collectionPlugin } from '../collection';
import { staffPlugin } from '../staff';
import { schoolPlugin } from '../school';
import { subjectsPlugin } from '../subjects';
import { demandTablePlugin } from './index';
import { getKit as demandKit } from './nodes';
import { getKit as staffKit } from '../staff/nodes';
import { getKit as schoolKit } from '../school/nodes';
import { getKit as subjectsKit } from '../subjects/nodes';

const mem = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null), setItem: (k: string, v: string) => { mem.set(k, String(v)); },
            removeItem: (k: string) => { mem.delete(k); }, clear: () => { mem.clear(); }, key: (i: number) => [...mem.keys()][i] ?? null,
            get length() { return mem.size; },
        },
    });
}

type Fld = { key: string; type: string; config?: { target?: { kind: string; nodeId: string } } };
const targetsOf = (listId: string) => Object.fromEntries((demandKit()!.userFieldsOf(listId) as Fld[]).filter((f) => f.type === 'relation').map((f) => [f.key, f.config?.target?.nodeId]));

/** 정본(교직원 명단·학년도+반 1-1·과목 목록)을 먼저 만들고 id 셋을 돌려준다. */
function seedCanon() {
    const staff = staffKit()!.createList()!;
    const nodes = schoolKit()!.nodes()!;
    nodes.create(nodes.roots.main, { type: 'school.school', name: '햇살초' });   // 학년도는 학교 노드가 있어야 만들어진다
    const year = schoolKit()!.createList()!;
    schoolKit()!.addItem(year, { name: '1-1' });
    const subj = subjectsKit()!.createList()!;
    return { staff, year, subj };
}

beforeEach(async () => {
    kv.store.clear(); mem.clear(); __resetPersistForTest(); setWorkspaceBridge({ open: () => 'v', close: () => {}, setTitle: () => {} } as never);
    await initStore({ storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} }, store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null } } as never);
    activateAll([...CORE_PLUGINS, collectionPlugin, schoolPlugin, subjectsPlugin, staffPlugin, demandTablePlugin]);
});

describe('시수표 대상 잡기 — 실제 활성·실제 host', () => {
    it('화면 길(kit.createList)로 만든 새 시수표도 세 칸 대상이 잡힌다', () => {
        const c = seedCanon();
        const lid = demandKit()!.createList()!;
        expect(targetsOf(lid)).toEqual({ f_teacher: c.staff, f_class: c.year, f_subject: c.subj });
    });

    it('정본보다 먼저 만든 시수표는 열 때 한 번 채워진다 — 사용자가 고른 대상은 안 덮는다', () => {
        const lid = demandKit()!.createList()!;
        expect(targetsOf(lid)).toEqual({ f_teacher: undefined, f_class: undefined, f_subject: undefined });
        const c = seedCanon();
        // 교사 칸은 사용자가 따로 골라 둔 상태
        const fields = (demandKit()!.userFieldsOf(lid) as Fld[]).map((f) => f.key === 'f_teacher' ? { ...f, config: { ...f.config, target: { kind: 'db', nodeId: 'mine' } } } : f);
        demandKit()!.setUserFields(lid, fields as never);
        demandKit()!.nodes()!.open(lid);
        expect(targetsOf(lid)).toEqual({ f_teacher: 'mine', f_class: c.year, f_subject: c.subj });
    });
});
