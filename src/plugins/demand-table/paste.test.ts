/**
 * 엑셀 붙여 넣기 증명 — 지어낸 51반 규모(3학년 × 17반) 정본에 붙이면 수요 줄이 생기고, 표엔 기본 넷 열만 · 정본에 없는 이름은 저장 0 + 보고.
 *   ⛔ 실명 금지(공개 레포) — 이름은 코드로 지어낸다.
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
import { parseDemandPaste, applyPaste, pasteSummary, normClass } from './paste';
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
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { getKit()?.init(null); setKit(null); __resetPersistForTest(); });

// ── 지어낸 정본 — 교사 40 · 과목 12 · 3학년 × 17반 = 51반. 읽기 면만(만드는 메서드가 없다 = 만들면 터진다).
const TEACHERS = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, listId: 'L', name: `교사${String.fromCharCode(0xac00 + i)}` }));
const SUBJECTS = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, listId: 'SL', name: `과목${String.fromCharCode(0xac00 + i)}` }));
const CLASSES = [1, 2, 3].flatMap((g) => Array.from({ length: 17 }, (_, i) => ({ id: `c${g}-${i + 1}`, yearId: 'y1', name: `${g}-${i + 1}`, grade: g, no: i + 1, rooms: [], special: false })));
const staff = { version: 1, lists: () => [{ id: 'L', name: '명단' }], staffIn: () => TEACHERS, member: (id: string) => TEACHERS.find((t) => t.id === id) } as unknown as Staff;
const subjects = { version: 1, lists: () => [{ id: 'SL', name: '목록' }], subjectsIn: () => SUBJECTS, subject: (id: string) => SUBJECTS.find((s) => s.id === id) } as unknown as Subjects;
const school = { version: 1, years: () => [{ id: 'y1', name: '2026' }], classesIn: (y: string) => (y === 'y1' ? CLASSES : []) } as unknown as School;
const canon: Canon = { staff, school, subjects };

/** 51반 규모 붙여 넣기 — 반마다 과목 4개 · 교사는 돌려 쓴다 + 머리글. */
function bigPaste(): { text: string; count: number } {
    const lines = ['교사\t반\t과목\t시수'];
    let n = 0;
    for (const c of CLASSES) for (let k = 0; k < 4; k++) {
        lines.push(`${TEACHERS[(n + k) % 40].name}\t${c.name}\t${SUBJECTS[(n + k) % 12].name}\t${2 + (k % 3)}`);
    }
    // 반 하나당 4줄 → 204줄
    return { text: lines.join('\r\n') + '\r\n', count: CLASSES.length * 4 };
}

describe('엑셀 붙여 넣기 — 해석(순수)', () => {
    it('51반 규모 붙여 넣기 → 수요 줄 전부 id 로 풀린다 · 못 찾은 것 0', () => {
        const { text, count } = bigPaste();
        const r = parseDemandPaste(text, canon);
        expect(r.hadHeader).toBe(true);
        expect(r.rows).toHaveLength(count);
        expect(r.notInCanon).toBe(0);
        expect(r.missing).toEqual({ teacher: [], klass: [], subject: [] });
        expect(r.rows[0]).toEqual({ teacherId: 't0', classId: 'c1-1', subjectId: 's0', hours: 2 });
    });

    it('머리글 없이도 기본 열 순서(교사·반·과목·시수)로 읽는다', () => {
        const r = parseDemandPaste(`${TEACHERS[3].name}\t2-5\t${SUBJECTS[1].name}\t3`, canon);
        expect(r.hadHeader).toBe(false);
        expect(r.rows).toEqual([{ teacherId: 't3', classId: 'c2-5', subjectId: 's1', hours: 3 }]);
    });

    it('열 순서가 달라도 머리글로 맞춘다 · 모르는 열은 「읽지 않은 열」', () => {
        const r = parseDemandPaste(`과목\t주당 시수\t특별실\t교사\t반\n${SUBJECTS[2].name}\t4\t과학실\t${TEACHERS[7].name}\t3학년 12반`, canon);
        expect(r.rows).toEqual([{ teacherId: 't7', classId: 'c3-12', subjectId: 's2', hours: 4 }]);
        expect(r.ignoredColumns).toEqual(['특별실']);
    });

    it('v1 양식 — 학년 열 + 「1,2,3」·「전체」 반', () => {
        const r = parseDemandPaste(`교사\t학년\t반\t과목\t주당 시수\n${TEACHERS[0].name}\t2\t1,2,3\t${SUBJECTS[0].name}\t3\n${TEACHERS[1].name}\t1\t전체\t${SUBJECTS[1].name}\t2`, canon);
        expect(r.rows.filter((x) => x.subjectId === 's0').map((x) => x.classId)).toEqual(['c2-1', 'c2-2', 'c2-3']);
        expect(r.rows.filter((x) => x.subjectId === 's1')).toHaveLength(17);
    });

    it('정본에 없는 이름 — 줄은 건너뛰고 칸별로 보고 · 같은 이름 줄 수를 센다', () => {
        const t = TEACHERS[0].name, s = SUBJECTS[0].name;
        const r = parseDemandPaste(['교사\t반\t과목\t시수', `${t}\t1-1\t${s}\t3`, `없는사람\t1-2\t${s}\t3`, `없는사람\t1-3\t${s}\t2`, `${t}\t9-9\t${s}\t1`, `${t}\t1-4\t없는과목\t1`].join('\n'), canon);
        expect(r.rows).toHaveLength(1);
        expect(r.notInCanon).toBe(4);
        expect(r.missing.teacher).toEqual([{ name: '없는사람', rows: 2, reason: 'none' }]);
        expect(r.missing.klass).toEqual([{ name: '9-9', rows: 1, reason: 'none' }]);
        expect(r.missing.subject).toEqual([{ name: '없는과목', rows: 1, reason: 'none' }]);
        expect(pasteSummary(r).join('\n')).toContain('정본에 없음 4건');
    });

    it('같은 이름이 정본에 둘이면 고르지 않고 「여럿」 으로 보고', () => {
        const dup = { ...canon, staff: { ...staff, staffIn: () => [...TEACHERS, { id: 'tx', listId: 'L', name: TEACHERS[0].name }] } as unknown as Staff };
        const r = parseDemandPaste(`${TEACHERS[0].name}\t1-1\t${SUBJECTS[0].name}\t3`, dup);
        expect(r.rows).toHaveLength(0);
        expect(r.missing.teacher[0].reason).toBe('ambiguous');
    });

    it('이상한 줄(시수 0·빈 칸)은 줄 번호와 이유를 남기고 건너뛴다 · 필수 열 없는 머리글은 통째 거절', () => {
        const r = parseDemandPaste(['교사\t반\t과목\t시수', `${TEACHERS[0].name}\t1-1\t${SUBJECTS[0].name}\t0`, `\t1-1\t${SUBJECTS[0].name}\t3`].join('\n'), canon);
        expect(r.bad.map((b) => b.line)).toEqual([2, 3]);
        const bad = parseDemandPaste('교사\t반\t시수\n가\t1-1\t3', canon);
        expect(bad.rows).toHaveLength(0);
        expect(bad.bad[0].why).toContain('과목');
    });

    it('반 이름 꼴 맞추기', () => {
        expect(normClass('3학년 2반')).toBe('3-2');
        expect(normClass(' 3 - 02 ')).toBe('3-2');
        expect(normClass('도움반')).toBe('도움반');
    });
});

describe('엑셀 붙여 넣기 — 시수표에 넣기(51반 규모)', () => {
    it('수요 줄이 생기고 표엔 기본 넷 열만 · 이름 글자는 저장되지 않는다', () => {
        const api = wire();
        const kit = getKit()!;
        const lid = kit.createList()!;
        const { text, count } = bigPaste();
        const plan = parseDemandPaste(text, canon);
        const ids = applyPaste(kit, lid, plan.rows);
        expect(ids).toHaveLength(count);
        expect(kit.itemsIn(lid)).toHaveLength(count);
        // 열 = 기본 넷 그대로(붙이기가 칸을 늘리지 않는다)
        const fields = (api.get(lid)!.data as { fields: { key: string }[] }).fields;
        expect(fields.map((f) => f.key)).toEqual([...BASE_COLUMN_KEYS]);
        // 줄 = id 참조 + 시수 → 정본으로 이름이 다시 풀린다
        const row = toDemandRow(kit.itemOf(ids[0])!);
        expect(row).toEqual({ id: ids[0], teacherId: 't0', classId: 'c1-1', subjectId: 's0', hours: 2 });
        expect(refText(resolveDemand(row, canon).teacher)).toBe(TEACHERS[0].name);
        const saved = JSON.stringify([...kv.store.values()]);
        expect(saved).not.toContain(TEACHERS[0].name);
        expect(saved).not.toContain(SUBJECTS[0].name);
    });

    it('정본에 없는 이름 줄은 저장 0 — 정본이 꺼져 있으면(약속 없음) 전부 「정본에 없음」', () => {
        wire();
        const kit = getKit()!;
        const lid = kit.createList()!;
        const off = parseDemandPaste(bigPaste().text, { staff: null, school: null, subjects: null });
        expect(off.rows).toHaveLength(0);
        expect(off.notInCanon).toBe(CLASSES.length * 4);
        expect(applyPaste(kit, lid, off.rows)).toEqual([]);
        expect(kit.itemsIn(lid)).toHaveLength(0);
    });
});
