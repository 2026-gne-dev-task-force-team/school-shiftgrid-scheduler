/**
 * 학교 정보 증명 — 학교 싱글톤 · 학교 없으면 학년도 못 만듦 · 반 칸 정의 · 약속 읽기. ⛔ 실명 금지(공개 레포) — 「햇살초」는 지어낸 이름.
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

import { initStore } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { defineCollection } from '../collection/define';
import { schoolNodeTypes, schoolNodeTypeImpl, SCHOOL_TYPE, YEAR_TYPE, CLASS_TYPE, getKit, setKit } from './nodes';
import { CLASS_CONFIG } from './config';
import { schoolApi } from './api';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

function wire() {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('school');
    for (const nt of schoolNodeTypes) api.registerContributed(nt, { nodeTypes: schoolNodeTypeImpl }, host());
    const kit = defineCollection(CLASS_CONFIG);
    setKit(kit, api);
    kit.init(api);
    return api;
}

beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { getKit()?.init(null); setKit(null, null); __resetPersistForTest(); });

describe('학교 — 싱글톤', () => {
    it('둘째 학교는 못 만든다', () => {
        const api = wire();
        const a = api.create(api.roots.main, { type: SCHOOL_TYPE, name: '햇살초' });
        expect(a).toBeTruthy();
        expect(api.create(api.roots.main, { type: SCHOOL_TYPE, name: '둘째' })).toBeFalsy();
    });
});

describe('학년도 — 학교가 있어야 만든다', () => {
    it('학교 없으면 못 만들고, 학교가 생기면 만들어진다(위치는 폴더 밑이어도 된다)', () => {
        const api = wire();
        expect(api.create(api.roots.main, { type: YEAR_TYPE, name: '2026 학년도' })).toBeFalsy();
        const folder = api.create(api.roots.main, { type: 'folder', name: 'f' });
        api.create(api.roots.main, { type: SCHOOL_TYPE, name: '햇살초' });
        expect(api.create(folder, { type: YEAR_TYPE, name: '2026 학년도' })).toBeTruthy();
    });
});

describe('반 칸 정의 · 약속 읽기', () => {
    it('기본 칸은 이름·학년·반·도움반·메모 · 새 학년도엔 교실(관계·여러 개) 칸이 심긴다', () => {
        expect(CLASS_CONFIG.baseFields.map((f) => [f.key, f.type])).toEqual([
            ['name', 'text'], ['grade', 'number'], ['no', 'number'], ['special', 'check'], ['memo', 'text'],
        ]);
        const api = wire();
        api.create(api.roots.main, { type: SCHOOL_TYPE, name: '햇살초' });
        const yid = getKit()!.createList()!;
        const f = (api.get(yid)?.data as { fields: { key: string; type: string; config: { many: boolean } }[] }).fields[0];
        expect([f.key, f.type, f.config.many]).toEqual(['f_room', 'relation', true]);
        expect(CLASS_TYPE.startsWith('school.')).toBe(true);
    });

    it('약속: 학교 하나 · 학년도 목록 · 학년도의 반 목록', () => {
        const api = wire();
        expect(schoolApi.school()).toBeUndefined();
        const sid = api.create(api.roots.main, { type: SCHOOL_TYPE, name: '햇살초', data: { values: { level: 'elementary', memo: '메모' } } });
        expect(schoolApi.school()).toEqual({ id: sid, name: '햇살초', level: 'elementary', memo: '메모' });
        const yid = getKit()!.createList()!;
        const cid = getKit()!.addItem(yid, { name: '3-2', grade: 3, no: 2, special: true, f_room: ['r1'] });
        expect(schoolApi.years().map((y) => y.id)).toEqual([yid]);
        expect(schoolApi.classesIn(yid)).toEqual([{ id: cid, yearId: yid, name: '3-2', grade: 3, no: 2, rooms: ['r1'], special: true }]);
    });
});
