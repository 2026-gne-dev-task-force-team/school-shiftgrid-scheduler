// @vitest-environment jsdom
/**
 * 보결 명단 → 교직원 명단(staff) 이사 증명(R4 · T-10ey) — ① 이사 전후 같은 사람·같은 값 ② 두 번 돌려도 같음 · 옛 값은 남고 「옮김」 표시만
 *   ③ 표시를 지우면 다시 옮긴다(되돌림 길) ④ 화면이 staff 약속의 값을 보여 주고 쓴다. ⛔ 실명 금지(공개 레포) — 지어낸 이름만.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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
import { registerType, clearTypes, isRecordType, isHiddenNode } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { defineCollection } from '../collection/define';
import { staffNodeTypes, staffNodeTypeImpl, setKit as setStaffKit, getKit as getStaffKit } from '../staff/nodes';
import { STAFF_CONFIG } from '../staff/config';
import { staffApi } from '../staff/api';
import { substituteNodeTypes, substituteNodeTypeImpl, LIST_TYPE, STAFF_TYPE, setNodes } from './nodes';
import { migrateSubstituteToStaff, MOVED_KEY } from './migrate';
import { SubstituteSheet } from './SubstituteSheet';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

/** 폴더 + 옛(substitute) 타입 둘 + 새(staff) 타입 둘 + staff 컬렉션 kit — 활성이 하는 일을 직접. 이사 주체는 substitute 호출자 api. */
function wire() {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const sub = makeNodesApi('substitute');
    for (const nt of substituteNodeTypes) sub.registerContributed(nt, { nodeTypes: substituteNodeTypeImpl }, host());
    const st = makeNodesApi('staff');
    for (const nt of staffNodeTypes) st.registerContributed(nt, { nodeTypes: staffNodeTypeImpl }, host());
    setStaffKit(defineCollection(STAFF_CONFIG));
    getStaffKit()!.init(st);
    setNodes(sub);
    return sub;
}

/** 옛 명단 하나 + 사람 셋(이름·구분·메모) — 옛 data 꼴 그대로(data.values). */
function seedOld(api: ReturnType<typeof wire>) {
    const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '우리 학교 보결', data: { fields: [{ key: 'f_kind', label: '구분', type: 'select', options: [{ value: 'homeroom', label: '담임' }] }] } });
    api.create(lid, { type: STAFF_TYPE, name: '가나다', data: { values: { f_kind: 'homeroom', memo: '1반' } } });
    api.create(lid, { type: STAFF_TYPE, name: '라마바', data: { values: { f_kind: 'assistant' } } });
    api.create(lid, { type: STAFF_TYPE, name: '사아자', data: { values: { f_kind: 'subject', memo: '체육' } } });
    return lid;
}

const movedOf = (api: ReturnType<typeof wire>, id: string) => (api.get(id)!.data as Record<string, unknown>)[MOVED_KEY] as string;

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { getStaffKit()?.init(null); setStaffKit(null); setNodes(null); __resetPersistForTest(); });

describe('이사 — 같은 사람·같은 값', () => {
    it('옛 타입은 substitute. 접두사 · 사람은 record', () => {
        wire();
        expect(LIST_TYPE.startsWith('substitute.')).toBe(true);
        expect(isRecordType(STAFF_TYPE)).toBe(true);
    });

    it('이사 뒤 staff 로 읽으면 이름·구분·메모가 그대로다', () => {
        const api = wire();
        const lid = seedOld(api);
        expect(migrateSubstituteToStaff(api)).toBe(4);   // 명단 1 + 사람 3
        const newList = movedOf(api, lid);
        expect(api.get(newList)?.type).toBe('staff.list');
        expect(api.get(newList)?.name).toBe('우리 학교 보결');
        const got = staffApi.staffIn(newList).map((m) => ({ name: m.name, kind: m.kind, memo: m.memo }));
        expect(got).toEqual([
            { name: '가나다', kind: 'homeroom', memo: '1반' },
            { name: '라마바', kind: 'assistant', memo: undefined },
            { name: '사아자', kind: 'subject', memo: '체육' },
        ]);
        // 칸 정의(선택지)도 따라간다
        expect((api.get(newList)!.data as { fields: { key: string }[] }).fields[0].key).toBe('f_kind');
    });

    it('두 번 돌려도 같다 — 새 노드 0 · 노드 수 그대로', () => {
        const api = wire();
        seedOld(api);
        migrateSubstituteToStaff(api);
        const count = () => api.byType('staff.list').length + api.byType('staff.member').length;
        expect(count()).toBe(4);
        expect(migrateSubstituteToStaff(api)).toBe(0);
        expect(migrateSubstituteToStaff(api)).toBe(0);
        expect(count()).toBe(4);
    });

    it('옛 값은 지우지 않는다 — 옛 노드·값은 그대로, 「옮김」 표시만 붙고 옛 명단은 탐색기에서 숨는다', () => {
        const api = wire();
        const lid = seedOld(api);
        const oldItems = api.children(lid).map((n) => ({ id: n.id, values: (n.data as { values: unknown }).values }));
        expect(isHiddenNode(api.get(lid)!)).toBe(false);   // 이사 전엔 보인다
        migrateSubstituteToStaff(api);
        expect(api.get(lid)).toBeTruthy();
        for (const o of oldItems) {
            const n = api.get(o.id)!;
            expect((n.data as { values: unknown }).values).toEqual(o.values);
            expect(typeof (n.data as Record<string, unknown>)[MOVED_KEY]).toBe('string');
        }
        expect(isHiddenNode(api.get(lid)!)).toBe(true);
    });

    it('이사 뒤 옛 명단에 더한 사람은 다음 번에 새 짝 명단으로 따라간다 · 표시를 지우면 그 명단을 다시 옮긴다(되돌림 길)', () => {
        const api = wire();
        const lid = seedOld(api);
        migrateSubstituteToStaff(api);
        const newList = movedOf(api, lid);
        api.create(lid, { type: STAFF_TYPE, name: '차카타', data: { values: { f_kind: 'nonteaching' } } });
        expect(migrateSubstituteToStaff(api)).toBe(1);
        expect(staffApi.staffIn(newList).map((m) => m.name)).toContain('차카타');
        api.setData(lid, { fields: (api.get(lid)!.data as { fields: unknown }).fields });   // 표시 지움
        expect(migrateSubstituteToStaff(api)).toBe(1);   // 명단만 다시(사람은 표시가 남아 그대로)
    });

    it('폴더 밑 옛 명단은 같은 폴더 밑 새 명단이 된다 · 휴지통의 것은 안 옮긴다', () => {
        const api = wire();
        const fid = api.create(api.roots.main, { type: 'folder', name: '보결' });
        const lid = api.create(fid, { type: LIST_TYPE, name: '폴더 안 명단' });
        const dead = api.create(api.roots.main, { type: LIST_TYPE, name: '버린 명단' });
        api.remove(dead);
        migrateSubstituteToStaff(api);
        expect(api.parent(movedOf(api, lid))).toBe(fid);
        expect(api.byType('staff.list').map((n) => n.name)).toEqual(['폴더 안 명단']);
    });

    it('staff 타입이 없으면(꺼져 있음) 못 옮기고 옛 표시도 안 붙는다', () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
        const sub = makeNodesApi('substitute');
        for (const nt of substituteNodeTypes) sub.registerContributed(nt, { nodeTypes: substituteNodeTypeImpl }, host());
        const lid = sub.create(sub.roots.main, { type: LIST_TYPE, name: '명단' });
        expect(migrateSubstituteToStaff(sub, () => false)).toBe(0);
        expect((sub.get(lid)!.data as Record<string, unknown> | undefined)?.[MOVED_KEY]).toBeUndefined();
    });
});

describe('화면 — staff 값을 보이고 staff 로 쓴다', () => {
    let root: Root; let container: HTMLDivElement;
    beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
    afterEach(() => { act(() => root.unmount()); container.remove(); });

    const fakeHost = { modules: { use: (n: string) => (n === 'staff' ? staffApi : null) } } as unknown as PluginHost;

    it('이사한 사람이 화면 줄로 뜨고(이름·구분) 구분을 고치면 staff 값이 바뀐다', () => {
        const api = wire();
        seedOld(api);
        migrateSubstituteToStaff(api);
        act(() => { root.render(<SubstituteSheet host={fakeHost} />); });
        const rows = [...container.querySelectorAll('[data-testid="sub-row"]')];
        expect(rows).toHaveLength(3);
        const names = rows.map((r) => (r.querySelector('input[aria-label="이름"]') as HTMLInputElement).value);
        expect(names).toEqual(['가나다', '라마바', '사아자']);
        const kinds = rows.map((r) => (r.querySelector('select') as HTMLSelectElement).value);
        expect(kinds).toEqual(['homeroom', 'assistant', 'subject']);
        // 쓰기 — 첫 사람의 구분을 바꾸면 staff 약속으로 읽은 값이 바뀐다
        const sel = rows[0].querySelector('select') as HTMLSelectElement;
        const newList = staffApi.lists()[0].id;
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
            setter.call(sel, 'nonteaching');
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(staffApi.staffIn(newList)[0].kind).toBe('nonteaching');
    });

    it('staff 가 꺼져 있으면 안내만 뜬다', () => {
        act(() => { root.render(<SubstituteSheet host={{ modules: { use: () => null } } as unknown as PluginHost} />); });
        expect(container.textContent).toContain('교직원 명단이 꺼져 있습니다');
    });
});
