/**
 * 과목 노드 증명 — 목록(subjects.list)은 탐색기에 보이고, 과목(subjects.subject)은 record 라 0줄. 저장·휴지통은 노드로.
 *   다리 조작의 본체는 collection/define.test 가 잰다 — 여기는 타입 둘·impl · subjects 모듈 표면 · 설정만 본다.
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
import { registerType, clearTypes, isRecordType, isContainerType } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { flatten } from '../../pane-ui-system/core/nodes/model/tree';
import { buildMainRows } from '../../pane-ui-system/core/explorer/views/rows';
import { defineCollection } from '../collection/define';
import { subjectsNodeTypes, subjectsNodeTypeImpl, LIST_TYPE, SUBJECT_TYPE, getKit, setKit } from './nodes';
import { SUBJECT_CONFIG, newListFields } from './config';
import { subjectsApi } from './api';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

/** 폴더 + subjects 타입 둘을 꽂은 NodesApi 하나 + 컬렉션 kit 연결(활성이 하는 일을 직접). */
function wire() {
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('subjects');
    for (const nt of subjectsNodeTypes) api.registerContributed(nt, { nodeTypes: subjectsNodeTypeImpl }, host());
    setKit(defineCollection(SUBJECT_CONFIG));
    getKit()!.init(api);
    return api;
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
});
afterEach(() => { getKit()?.init(null); setKit(null); __resetPersistForTest(); });

describe('타입 둘 — 목록은 보이고 과목(record)은 탐색기 0줄', () => {
    it('접두사 subjects. · 목록은 flatten 에 · 과목은 안 보이고 byType·children 엔 있다', () => {
        const api = wire();
        expect(LIST_TYPE.startsWith('subjects.')).toBe(true);
        expect(SUBJECT_TYPE.startsWith('subjects.')).toBe(true);

        const root = api.roots.main;
        const lid = api.create(root, { type: LIST_TYPE, name: '우리 학교 과목' });
        const sid = api.create(lid, { type: SUBJECT_TYPE, name: '국어', data: { values: { short: '국' } } });
        expect(lid).not.toBe('');
        expect(sid).not.toBe('');

        const tree = getState().tree;
        const flatIds = flatten(tree, root, isContainerType, { isRecord: isRecordType }).map((r) => r.id);
        expect(flatIds).toContain(lid);
        expect(flatIds).not.toContain(sid);
        expect(buildMainRows(tree, root, isRecordType).map((r) => r.id)).not.toContain(sid);

        expect(api.byType(SUBJECT_TYPE).map((n) => n.id)).toEqual([sid]);
        expect(api.byType(LIST_TYPE).map((n) => n.id)).toEqual([lid]);
        expect(api.children(lid).map((n) => n.id)).toContain(sid);
    });

    it('우클릭 메뉴(impl)는 kit 를 거친다 — 「과목 목록 열기」 명령 하나', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        expect(subjectsNodeTypeImpl.list.menu(host(), lid)).toEqual([{ label: '과목 목록 열기', icon: 'book', commandId: 'subjects.openList', commandArg: { nodeId: lid } }]);
    });
});

describe('subjects 모듈 표면 — 이름·약칭·메모·구분 ↔ 칸 값', () => {
    it('addSubject·subjectsIn·updateSubject·moveSubject·pasteSubjects 가 같은 값을 준다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '표면목록' });
        const a = subjectsApi.addSubject(lid, { name: '국어', short: '국', memo: '교과' });
        subjectsApi.addSubject(lid, { name: '수학' });
        expect(subjectsApi.version).toBe(1);
        expect(subjectsApi.lists().map((l) => l.name)).toContain('표면목록');
        const rows = subjectsApi.subjectsIn(lid);
        expect(rows.map((p) => [p.name, p.short, p.memo])).toEqual([['국어', '국', '교과'], ['수학', undefined, undefined]]);

        subjectsApi.updateSubject(a, { name: '국어A', memo: '' });
        expect(subjectsApi.subject(a)).toEqual({ id: a, listId: lid, name: '국어A', short: '국' });   // 빈 메모는 안 싣는다

        const ids = subjectsApi.pasteSubjects(lid, '음악\t음\t전담\n\n미술');
        expect(ids).toHaveLength(2);
        expect(subjectsApi.subjectsIn(lid).map((p) => p.name)).toEqual(['국어A', '수학', '음악', '미술']);

        const l2 = api.create(api.roots.main, { type: LIST_TYPE, name: '다른 목록' });
        subjectsApi.moveSubject(a, l2);
        expect(subjectsApi.subjectsIn(l2).map((p) => p.id)).toEqual([a]);
        subjectsApi.removeSubject(a);
        expect(subjectsApi.subjectsIn(l2)).toEqual([]);
    });

    it('구분(f_kind) 칸 값은 약속 kind 로 나오고, 모르는 값은 안 싣는다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '구분목록' });
        const ok = api.create(lid, { type: SUBJECT_TYPE, name: '체육', data: { values: { f_kind: 'subject' } } });
        const bad = api.create(lid, { type: SUBJECT_TYPE, name: '기타', data: { values: { f_kind: 'zzz' } } });
        expect(subjectsApi.subject(ok)?.kind).toBe('subject');
        expect(subjectsApi.subject(bad)?.kind).toBeUndefined();
    });

    it('onChange 는 노드 변경마다 깨우고 dispose 로 멈춘다', () => {
        const api = wire();
        const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '목록' });
        let n = 0;
        const sub = subjectsApi.onChange(() => { n++; });
        subjectsApi.addSubject(lid, { name: '하나' });
        expect(n).toBeGreaterThan(0);
        sub.dispose();
        const before = n;
        subjectsApi.addSubject(lid, { name: '둘' });
        expect(n).toBe(before);
    });
});

describe('설정 — 기본 칸은 이름·약칭·메모, 새 목록 칸은 구분·색·특별실', () => {
    it('baseFields 는 셋뿐이고 전부 locked', () => {
        expect(SUBJECT_CONFIG.baseFields.map((f) => f.key)).toEqual(['name', 'short', 'memo']);
        expect(SUBJECT_CONFIG.baseFields.every((f) => f.locked)).toBe(true);
    });

    it('newListFields — 구분(locked·value 영어 고정) · 색 · 특별실(relation many), 부를 때마다 새 객체', () => {
        const f = newListFields();
        expect(f.map((x) => [x.key, x.type])).toEqual([['f_kind', 'select'], ['f_color', 'select'], ['f_room', 'relation']]);
        expect(f[0].locked).toBe(true);
        expect(f[0].options?.map((o) => o.value)).toEqual(['homeroom', 'subject', 'common']);
        expect(f[2].config).toMatchObject({ many: true });
        expect(newListFields()[0]).not.toBe(f[0]);
    });
});
