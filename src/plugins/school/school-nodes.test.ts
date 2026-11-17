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
import { schoolNodeTypes, schoolNodeTypeImpl, SCHOOL_TYPE, YEAR_TYPE, CLASS_TYPE, getKit, setKit, openSchoolSheet, currentYearName, initSchool } from './nodes';
import { CLASS_CONFIG } from './config';
import { schoolApi } from './api';
import type { RecordViewApi } from '../collection/contracts/collection';

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

describe('반 → 교실 읽기 — collection 약속의 resolveRelationTargets 를 거친다', () => {
    it('칸 설정(config)과 칸 값을 약속에 넘기고, 돌아온 방 id 를 rooms 로 쓴다', () => {
        const api = wire();
        api.create(api.roots.main, { type: SCHOOL_TYPE, name: '햇살초' });
        const yid = getKit()!.createList()!;
        const cid = getKit()!.addItem(yid, { name: '3-2', f_room: ['classX'] });
        const calls: unknown[][] = [];
        const rv = { schema: { resolveRelationTargets: (...a: unknown[]) => { calls.push(a); return ['roomA']; } } } as unknown as RecordViewApi;
        setKit(getKit(), api, rv);
        expect(schoolApi.classesIn(yid).find((c) => c.id === cid)?.rooms).toEqual(['roomA']);
        expect(calls[0][0]).toEqual(['classX']);
        expect(calls[0][1]).toEqual({ many: true });
        setKit(getKit(), api, null);
    });
});

describe('학년도·반 열기 — 처음 쓰는 선생님 길', () => {
    const opened: string[] = [];
    const openHost = (): PluginHost => ({ ...host(), workspace: { open: (id: string) => { opened.push(id); } } }) as unknown as PluginHost;

    it('빈 저장소 → 열기 → 학교와 올해 학년도가 생기고 그 학년도가 열리며, 반을 더할 수 있다', () => {
        opened.length = 0;
        const api = wire();
        expect(schoolApi.years()).toEqual([]);
        openSchoolSheet(openHost());
        const years = schoolApi.years();
        expect(years.map((y) => y.name)).toEqual([currentYearName()]);
        expect(schoolApi.school()?.name).toBe('우리 학교');
        expect(getKit()!.active()).toBe(years[0].id);
        expect(opened).toEqual(['school.sheet']);
        expect(getKit()!.addItem(years[0].id, { name: '3-2' })).toBeTruthy();
        expect(schoolApi.classesIn(years[0].id).map((c) => c.name)).toEqual(['3-2']);
        // 두 번째 열기는 학년도를 또 만들지 않는다
        openSchoolSheet(openHost());
        expect(schoolApi.years()).toHaveLength(1);
        expect(api.liveByType(SCHOOL_TYPE)).toHaveLength(1);
    });

    it('학년도 이름 — 1~2월은 지난해 학년도', () => {
        expect(currentYearName(new Date(2027, 1, 10))).toBe('2026 학년도');
        expect(currentYearName(new Date(2026, 2, 2))).toBe('2026 학년도');
    });

    it('「새로 만들기」 변형 「학년도·반」은 학교가 없을 때 학교 줄 뒤에 붙고 누르면 같은 길을 탄다', () => {
        opened.length = 0;
        wire();
        const h = openHost();
        (h as unknown as { modules: unknown }).modules = { use: () => undefined };
        initSchool(h);   // 호스트를 쥔다(모듈은 없어 kit 는 비지만 아래에서 다시 꽂는다)
        const api = wire();
        const v = schoolNodeTypeImpl.school.createVariants!();
        expect(v.map((x) => x.label)).toEqual(['학년도·반']);
        v[0].run();
        expect(schoolApi.years()).toHaveLength(1);
        expect(api.liveByType(SCHOOL_TYPE)).toHaveLength(1);
    });
});
