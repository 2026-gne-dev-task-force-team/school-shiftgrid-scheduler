/**
 * 선택 열 증명(F4) — ① 안 켠 시수표엔 선택 열 0 ② 켜면 칸이 생기고 끄면 사라지되 값은 남는다
 *   ③ 붙여 넣기가 켜진 열의 머리글만 읽는다(꺼져 있으면 「읽지 않은 열」) ④ 특별실은 정본 rooms 의 id 만 저장한다.
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

import { initStore } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { defineCollection } from '../collection/define';
import { demandNodeTypes, demandNodeTypeImpl, getKit, setKit } from './nodes';
import { DEMAND_CONFIG, BASE_COLUMN_KEYS } from './config';
import { toDemandRow, resolveDemand, refText, type Canon } from './resolve';
import { parseDemandPaste, applyPaste, pasteSummary } from './paste';
import { OPTIONAL_COLUMNS, OPTIONAL_KEYS, enabledOptionalKeys, setOptionalColumn } from './optional-columns';
import type { Staff } from '../staff/contracts/staff';
import type { School } from '../school/contracts/school';
import type { Subjects } from '../subjects/contracts/subjects';
import type { Rooms } from '../rooms/contracts/rooms';

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
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { getKit()?.init(null); setKit(null); __resetPersistForTest(); });

const TEACHERS = [{ id: 't0', listId: 'L', name: '가나다' }, { id: 't1', listId: 'L', name: '라마바' }];
const SUBJECTS = [{ id: 's0', listId: 'SL', name: '영어' }];
const CLASSES = [{ id: 'c1-1', yearId: 'y1', name: '1-1', grade: 1, no: 1, rooms: [], special: false }];
const ROOMS = [{ id: 'r0', listId: 'RL', name: '첫째 연습실' }, { id: 'r1', listId: 'RL', name: '둘째 연습실' }];
const staff = { version: 1, lists: () => [{ id: 'L', name: '명단' }], staffIn: () => TEACHERS, member: (id: string) => TEACHERS.find((t) => t.id === id) } as unknown as Staff;
const subjects = { version: 1, lists: () => [{ id: 'SL', name: '목록' }], subjectsIn: () => SUBJECTS, subject: (id: string) => SUBJECTS.find((s) => s.id === id) } as unknown as Subjects;
const school = { version: 1, years: () => [{ id: 'y1', name: '2026' }], classesIn: () => CLASSES } as unknown as School;
const rooms = { version: 1, lists: () => [{ id: 'RL', name: '방' }], roomsIn: () => ROOMS, room: (id: string) => ROOMS.find((r) => r.id === id) } as unknown as Rooms;
const canon: Canon = { staff, school, subjects, rooms };

const HEAD = '교사\t반\t과목\t시수\t함께수업\t특별실\t연속수업\t진도맞춤\t격주\t고정';
const LINE = '가나다\t1-1\t영어\t4\t라마바\t첫째 연습실\t2,2\tO\tO\t';

describe('시수표 선택 열', () => {
    it('안 붙인 시수표엔 선택 열 0 — 새 시수표 칸은 기본 넷뿐', () => {
        const api = wire();
        const kit = getKit()!;
        const lid = kit.createList()!;
        expect(enabledOptionalKeys(kit, lid)).toEqual([]);
        expect((api.get(lid)!.data as { fields: { key: string }[] }).fields.map((f) => f.key)).toEqual([...BASE_COLUMN_KEYS]);
        expect(OPTIONAL_KEYS).toHaveLength(OPTIONAL_COLUMNS.length);
    });

    it('켜면 보이고 순서가 고정 · 끄면 칸은 사라지되 적어 둔 값은 남는다', () => {
        wire();
        const kit = getKit()!;
        const lid = kit.createList()!;
        setOptionalColumn(kit, lid, 'f_pinned', true);
        setOptionalColumn(kit, lid, 'f_room', true);
        setOptionalColumn(kit, lid, 'f_room', true); // 두 번째는 무변경
        expect(enabledOptionalKeys(kit, lid)).toEqual(['f_room', 'f_pinned']);
        expect(kit.userFieldsOf(lid).map((f) => f.key)).toEqual([...BASE_COLUMN_KEYS, 'f_room', 'f_pinned']);
        const id = kit.addItem(lid, { name: '', f_pinned: true } as never);
        setOptionalColumn(kit, lid, 'f_pinned', false);
        expect(enabledOptionalKeys(kit, lid)).toEqual(['f_room']);
        setOptionalColumn(kit, lid, 'f_pinned', true);
        expect(toDemandRow(kit.itemOf(id)!).pinned).toBe(true);
    });

    it('붙여 넣기 — 꺼져 있으면 선택 열 머리글은 「읽지 않은 열」 · 줄에 선택 값 0', () => {
        wire();
        const kit = getKit()!;
        const lid = kit.createList()!;
        const r = parseDemandPaste(`${HEAD}\n${LINE}`, canon, { columns: enabledOptionalKeys(kit, lid) });
        expect(r.ignoredColumns).toEqual(['함께수업', '특별실', '연속수업', '진도맞춤', '격주', '고정']);
        expect(r.rows).toEqual([{ teacherId: 't0', classId: 'c1-1', subjectId: 's0', hours: 4 }]);
        expect(pasteSummary(r).join('\n')).toContain('「선택 열」');
    });

    it('붙여 넣기 — 켜면 읽는다 · 특별실·공동 담당은 정본 id 만 저장(이름 글자 저장 0)', () => {
        wire();
        const kit = getKit()!;
        const lid = kit.createList()!;
        for (const c of OPTIONAL_COLUMNS) setOptionalColumn(kit, lid, c.key, true);
        const r = parseDemandPaste(`${HEAD}\n${LINE}`, canon, { columns: enabledOptionalKeys(kit, lid) });
        expect(r.ignoredColumns).toEqual([]);
        expect(r.rows).toEqual([{ teacherId: 't0', classId: 'c1-1', subjectId: 's0', hours: 4, coTeacherId: 't1', roomId: 'r0', block: '2,2', cycleSync: true, biweekly: true }]);
        const ids = applyPaste(kit, lid, r.rows);
        const row = toDemandRow(kit.itemOf(ids[0])!);
        expect(row).toMatchObject({ coTeacherId: 't1', roomId: 'r0', block: '2,2', cycleSync: true, biweekly: true });
        expect(row.pinned).toBeUndefined();
        const res = resolveDemand(row, canon);
        expect(refText(res.room)).toBe('첫째 연습실');
        expect(refText(res.coTeacher)).toBe('라마바');
        const saved = JSON.stringify([...kv.store.values()]);
        expect(saved).not.toContain('첫째 연습실');
        expect(saved).not.toContain('라마바');
    });

    it('켜진 열만 쓰인다 — 특별실만 켠 시수표에 다른 열 값은 새지 않는다', () => {
        wire();
        const kit = getKit()!;
        const lid = kit.createList()!;
        setOptionalColumn(kit, lid, 'f_room', true);
        const r = parseDemandPaste(`${HEAD}\n${LINE}`, canon, { columns: enabledOptionalKeys(kit, lid) });
        expect(r.rows[0]).toMatchObject({ roomId: 'r0' });
        expect(r.rows[0].block).toBeUndefined();
        const forced = applyPaste(kit, lid, [{ teacherId: 't0', classId: 'c1-1', subjectId: 's0', hours: 1, block: '2', pinned: true, roomId: 'r1' }]);
        const row = toDemandRow(kit.itemOf(forced[0])!);
        expect(row.roomId).toBe('r1');
        expect(row.block).toBeUndefined();
        expect(row.pinned).toBeUndefined();
    });

    it('정본 방에 없는 특별실·이상한 묶음은 줄을 건너뛰고 보고', () => {
        const r = parseDemandPaste(`${HEAD}\n가나다\t1-1\t영어\t4\t\t없는방\t\t\t\t\n가나다\t1-1\t영어\t4\t\t\t두시간\t\t\t`, canon, { columns: OPTIONAL_KEYS });
        expect(r.rows).toHaveLength(0);
        expect(r.notInCanon).toBe(1);
        expect(r.missingRoom).toEqual([{ name: '없는방', rows: 1, reason: 'none' }]);
        expect(r.bad.map((b) => b.line)).toEqual([3]);
        expect(pasteSummary(r).join('\n')).toContain('특별실: 없는방');
    });
});
