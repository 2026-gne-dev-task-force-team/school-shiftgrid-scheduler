/**
 * 시수표 증명 — ① 자료 꼴(기본 넷 열만 · 칸은 id 참조+숫자뿐) ② 정본을 약속으로 읽기(이름 끌어오기 · 없는 id 는 「찾을 수 없음」) ③ 화면 설정이 바닥에 얹힘.
 *   ⛔ 실명 금지(공개 레포) — 지어낸 이름만.
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

import { initStore, getState } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes, isRecordType } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { defineCollection } from '../collection/define';
import { demandNodeTypes, demandNodeTypeImpl, LIST_TYPE, ROW_TYPE, getKit, setKit } from './nodes';
import { DEMAND_CONFIG, BASE_COLUMN_KEYS, newListFields } from './config';
import { manifest } from './manifest';
import { resolveDemand, toDemandRow, refText, NOT_FOUND, type Canon } from './resolve';
import type { Staff } from '../staff/contracts/staff';
import type { School } from '../school/contracts/school';
import type { Subjects } from '../subjects/contracts/subjects';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

function wire() {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('demand-table');
    for (const nt of demandNodeTypes) api.registerContributed(nt, { nodeTypes: demandNodeTypeImpl }, host());
    setKit(defineCollection(DEMAND_CONFIG));
    getKit()!.init(api);
    return api;
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    void getState;
});
afterEach(() => { getKit()?.init(null); setKit(null); __resetPersistForTest(); });

// 지어낸 정본 — 약속(Staff·School·Subjects) 읽기 면만 흉내 낸다.
const staff = { version: 1, member: (id: string) => (id === 't1' ? { id, listId: 'L', name: '가나다' } : undefined) } as unknown as Staff;
const school = {
    version: 1,
    years: () => [{ id: 'y1', name: '2026' }],
    classesIn: (y: string) => (y === 'y1' ? [{ id: 'c1', yearId: 'y1', name: '3-2', rooms: [], special: false }] : []),
} as unknown as School;
const subjects = { version: 1, subject: (id: string) => (id === 's1' ? { id, listId: 'SL', name: '수학' } : undefined) } as unknown as Subjects;
const canon: Canon = { staff, school, subjects };

describe('시수표 — 자료 꼴', () => {
    it('id 는 폴더명 · 타입 접두사 demand-table. · 수요 줄은 record', () => {
        wire();
        expect(manifest.id).toBe('demand-table');
        expect(LIST_TYPE.startsWith('demand-table.')).toBe(true);
        expect(isRecordType(ROW_TYPE)).toBe(true);
    });

    it('기본 넷 열 = 교사·반·과목·시수 — 새 시수표에 이 넷만 심기고 선택 열은 0', () => {
        const api = wire();
        const lid = getKit()!.createList()!;
        const data = api.get(lid)?.data as { fields: { key: string; label: string; type: string; locked?: boolean }[] };
        const fields = data.fields;
        expect(fields.map((f) => f.label)).toEqual(['교사', '반', '과목', '시수']);
        expect(fields.map((f) => f.key)).toEqual([...BASE_COLUMN_KEYS]);
        expect(fields.map((f) => f.type)).toEqual(['relation', 'relation', 'relation', 'number']);
        expect(fields.every((f) => f.locked)).toBe(true);
        // 제목 칸(바닥 요구) 하나는 「메모」 — 정본 정보가 아니다.
        expect(DEMAND_CONFIG.baseFields.map((f) => f.label)).toEqual(['메모']);
    });

    it('탐색기 길(createInit)도 같은 넷 — 부를 때마다 새 객체', () => {
        const a = demandNodeTypeImpl.list.createInit();
        const b = demandNodeTypeImpl.list.createInit();
        expect(a.data.fields.map((f) => f.key)).toEqual([...BASE_COLUMN_KEYS]);
        expect(a.data.fields[0]).not.toBe(b.data.fields[0]);
        expect(newListFields()).toHaveLength(4);
    });

    it('저장되는 줄 = id 참조 셋 + 시수 — 이름 글자는 어디에도 안 저장된다', () => {
        wire();
        const kit = getKit()!;
        const lid = kit.createList()!;
        const rid = kit.addItem(lid, { name: '', f_teacher: ['t1'], f_class: ['c1'], f_subject: ['s1'], f_hours: 4 } as never);
        const row = toDemandRow(kit.itemOf(rid)!);
        expect(row).toEqual({ id: rid, teacherId: 't1', classId: 'c1', subjectId: 's1', hours: 4 });
        const saved = JSON.stringify([...kv.store.values()]);
        expect(saved).not.toContain('가나다');
        expect(saved).not.toContain('수학');
    });
});

describe('시수표 — 정본을 약속으로 읽기', () => {
    const row = { id: 'r1', teacherId: 't1', classId: 'c1', subjectId: 's1', hours: 3 };

    it('교사·반·과목 이름을 정본에서 끌어온다', () => {
        const r = resolveDemand(row, canon);
        expect(refText(r.teacher)).toBe('가나다');
        expect(refText(r.klass)).toBe('3-2');
        expect(refText(r.subject)).toBe('수학');
        expect(r.hours).toBe(3);
    });

    it('정본에 없는 id 는 「찾을 수 없음」 — 줄은 그대로 남는다', () => {
        const r = resolveDemand({ ...row, teacherId: 'gone', classId: 'gone2', subjectId: 'gone3' }, canon);
        expect([r.teacher, r.klass, r.subject].map(refText)).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND]);
        expect(r.teacher?.id).toBe('gone');
    });

    it('비어 있는 칸은 아무것도 안 보인다(찾을 수 없음 아님) · 정본 플러그인이 꺼졌으면 전부 찾을 수 없음', () => {
        const empty = resolveDemand({ id: 'r2' }, canon);
        expect([empty.teacher, empty.klass, empty.subject].map(refText)).toEqual(['', '', '']);
        const off = resolveDemand(row, { staff: null, school: null, subjects: null });
        expect([off.teacher, off.klass, off.subject].map(refText)).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND]);
    });
});
