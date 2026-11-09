/**
 * 노드 다리 — 어댑터(nodes.ts)가 RecordView 의 콜백을 NodesApi 쓰기 묶음(batch)으로 옮기는지.
 *   NodesApi 는 메모리 가짜(실제 탐색기 스토어와 같은 약속) — 묶음 안에서만 쓰는지 · 한 tx = 한 묶음인지를 센다.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { NodesApi, PublicNode } from '../project-explorer/contracts/nodes';
import { DB_TYPE, ROW_TYPE, commit, indentRow, initRecordNodes, outdentRow, restoreTrashedRows, snapshotOf, toggleRowCollapse, trashedRows } from './nodes';
import { blankDb } from './schema';

interface N { id: string; type: string; name: string; children: string[]; data?: unknown; trashedFrom?: string }

function fakeApi() {
    const nodes = new Map<string, N>();
    nodes.set('root', { id: 'root', type: 'folder', name: '루트', children: [] });
    nodes.set('trash', { id: 'trash', type: 'folder', name: '휴지통', children: [] });
    let seq = 0;
    let depth = 0;
    const log = { batches: 0, writesOutside: 0, writes: 0 };
    const listeners = new Set<(ids: string[]) => void>();
    const write = () => { log.writes++; if (depth === 0) log.writesOutside++; };
    const parentOf = (id: string) => [...nodes.values()].find((n) => n.children.includes(id))?.id ?? null;
    const api: NodesApi = {
        version: 1,
        types: { register: () => ({ dispose() {} }) },
        registerContributed: () => ({ dispose() {} }),
        get: (id) => (nodes.has(id) ? ({ ...nodes.get(id)! } as unknown as PublicNode) : undefined),
        children: (id) => (nodes.get(id)?.children ?? []).map((c) => ({ ...nodes.get(c)! }) as unknown as PublicNode),
        parent: parentOf, path: () => [], find: () => [], byType: (t) => [...nodes.values()].filter((n) => n.type === t) as unknown as PublicNode[],
        create: (pid, spec) => { write(); const id = `n${++seq}`; nodes.set(id, { id, type: spec.type, name: spec.name, children: [], data: spec.data }); nodes.get(pid)!.children.push(id); return id; },
        rename: (id, name) => { write(); if (name.trim()) nodes.get(id)!.name = name; },
        setData: (id, data) => { write(); nodes.get(id)!.data = data; },
        move: (id, pid) => { write(); const from = parentOf(id); if (from) nodes.get(from)!.children = nodes.get(from)!.children.filter((c) => c !== id); nodes.get(pid)!.children.push(id); delete nodes.get(id)!.trashedFrom; },
        remove: (id) => { write(); const from = parentOf(id)!; nodes.get(from)!.children = nodes.get(from)!.children.filter((c) => c !== id); nodes.get(id)!.trashedFrom = from; nodes.get('trash')!.children.push(id); },
        batch: (fn) => { log.batches++; depth++; try { fn(); } finally { depth--; for (const l of listeners) l([]); } },
        invalidate: () => {}, select: () => {}, open: () => {}, promptInput: () => {},
        subscribe: (fn) => { listeners.add(fn); return { dispose() { listeners.delete(fn); } }; },
        roots: { main: 'root', trash: 'trash' },
    };
    return { api, nodes, log };
}

let env: ReturnType<typeof fakeApi>;
let dbId = '';
let titleKey = '';

beforeEach(() => {
    env = fakeApi();
    initRecordNodes(env.api);
    const doc = blankDb();
    titleKey = doc.titleKey;
    dbId = env.api.create('root', { type: DB_TYPE, name: '내 뷰', data: doc });
    env.log.batches = 0; env.log.writes = 0; env.log.writesOutside = 0;
});

describe('commit — 한 tx = 한 묶음', () => {
    it('행 추가 — 부모는 그 레코드 뷰 · 제목 칸 값은 노드 이름', () => {
        const ids = commit(dbId, { addRows: [{ [titleKey]: '첫 줄' }, {}] });
        expect(ids).toHaveLength(2);
        expect(env.api.parent(ids[0])).toBe(dbId);
        expect(env.nodes.get(ids[0])!.name).toBe('첫 줄');
        expect(env.nodes.get(ids[0])!.type).toBe(ROW_TYPE);
        expect(env.log.batches).toBe(1);
        expect(env.log.writesOutside).toBe(0);   // 쓰기는 전부 묶음 안
    });

    it('붙여넣기 3행 + 칸 2개 = 묶음 한 번(되돌리기 한 번)', () => {
        const doc = snapshotOf(dbId)!.doc;
        commit(dbId, {
            fields: [...doc.fields, { key: 'f_a', label: '칸 2', type: 'text' }, { key: 'f_b', label: '칸 3', type: 'text' }],
            addRows: [{ [titleKey]: 'a', f_a: 'x' }, { [titleKey]: 'b' }, { [titleKey]: 'c' }],
        });
        expect(env.log.batches).toBe(1);
        const snap = snapshotOf(dbId)!;
        expect(snap.records).toHaveLength(3);
        expect(snap.doc.fields).toHaveLength(3);
    });

    it('제목 셀 수정 — 값과 노드 이름이 같이 바뀐다 · 빈 제목은 이름을 안 지운다', () => {
        const [row] = commit(dbId, { addRows: [{ [titleKey]: '옛' }] });
        commit(dbId, { cells: [{ id: row, key: titleKey, value: '새' }] });
        expect(env.nodes.get(row)!.name).toBe('새');
        expect((env.nodes.get(row)!.data as { values: Record<string, string> }).values[titleKey]).toBe('새');
        commit(dbId, { cells: [{ id: row, key: titleKey, value: '' }] });
        expect(env.nodes.get(row)!.name).toBe('새');   // rename 이 빈 이름을 무시한다
        expect(snapshotOf(dbId)!.records[0][titleKey]).toBe('');   // 화면은 값(빈 칸)을 보인다
    });

    it('같은 행의 여러 칸은 한 번만 쓴다 · updated 가 갱신된다', () => {
        const [row] = commit(dbId, { addRows: [{}] });
        env.log.writes = 0;
        commit(dbId, { cells: [{ id: row, key: 'f_a', value: 1 }, { id: row, key: 'f_b', value: 2 }] });
        expect(env.log.writes).toBe(1);
        expect((env.nodes.get(row)!.data as { values: Record<string, number> }).values).toEqual({ f_a: 1, f_b: 2 });
    });

    it('타입 변환 = 칸 정의 + 여러 행 값이 한 묶음', () => {
        const rows = commit(dbId, { addRows: [{ f_x: '12' }, { f_x: '12a' }] });
        const doc = snapshotOf(dbId)!.doc;
        env.log.batches = 0;
        commit(dbId, {
            fields: [...doc.fields, { key: 'f_x', label: 'x', type: 'number' }],
            cells: [{ id: rows[0], key: 'f_x', value: 12 }, { id: rows[1], key: 'f_x', value: null }],
        });
        expect(env.log.batches).toBe(1);
        expect(snapshotOf(dbId)!.records.map((r) => r.f_x)).toEqual([12, null]);
    });
});

describe('휴지통 — 레코드성 행은 탐색기 구역에 안 보이니 레코드 뷰가 되살린다', () => {
    it('삭제 → 표에서 사라짐 · 휴지통 행 수 · 복원 → 돌아옴', () => {
        const ids = commit(dbId, { addRows: [{ [titleKey]: 'a' }, { [titleKey]: 'b' }] });
        commit(dbId, { removeRows: [ids[0]] });
        expect(snapshotOf(dbId)!.records).toHaveLength(1);
        expect(snapshotOf(dbId)!.trashedRows).toBe(1);
        expect(trashedRows(dbId).map((n) => n.id)).toEqual([ids[0]]);
        expect(restoreTrashedRows(dbId)).toBe(1);
        expect(snapshotOf(dbId)!.records).toHaveLength(2);
        expect(snapshotOf(dbId)!.trashedRows).toBe(0);
    });
    it('다른 레코드 뷰의 휴지통 행은 섞이지 않는다', () => {
        const other = env.api.create('root', { type: DB_TYPE, name: '다른', data: blankDb() });
        const [r] = commit(other, { addRows: [{}] });
        commit(other, { removeRows: [r] });
        expect(trashedRows(dbId)).toHaveLength(0);
        expect(trashedRows(other)).toHaveLength(1);
    });
});

describe('하위 항목 — 행 밑에 행(노드 중첩)', () => {
    const parentOf = (rowId: string) => snapshotOf(dbId)!.records.find((r) => r.id === rowId)?.__parent ?? null;

    it('들여쓰기 — 둘째 형제가 첫째의 자식이 된다 · 첫째 형제는 들여쓸 수 없다', () => {
        const [a, b] = commit(dbId, { addRows: [{ [titleKey]: 'a' }, { [titleKey]: 'b' }] });
        indentRow(a);                       // 첫 형제 → 아무 일 없음
        expect(parentOf(a)).toBeNull();
        indentRow(b);                       // 둘째 → a 의 자식
        expect(parentOf(b)).toBe(a);
        expect(snapshotOf(dbId)!.records).toHaveLength(2);   // 여전히 둘(중첩이지 삭제 아님)
    });

    it('내어쓰기 — 자식이 다시 뿌리로 · 뿌리는 내어쓸 수 없다', () => {
        const [a, b] = commit(dbId, { addRows: [{ [titleKey]: 'a' }, { [titleKey]: 'b' }] });
        indentRow(b);
        expect(parentOf(b)).toBe(a);
        outdentRow(b);
        expect(parentOf(b)).toBeNull();
        outdentRow(a);                      // 이미 뿌리 → 아무 일 없음
        expect(parentOf(a)).toBeNull();
    });

    it('접기 토글 — RowDoc.collapsed 가 뒤집힌다', () => {
        const [a] = commit(dbId, { addRows: [{ [titleKey]: 'a' }] });
        expect(snapshotOf(dbId)!.records[0].__collapsed).toBe(false);
        toggleRowCollapse(a);
        expect(snapshotOf(dbId)!.records.find((r) => r.id === a)!.__collapsed).toBe(true);
        toggleRowCollapse(a);
        expect(snapshotOf(dbId)!.records.find((r) => r.id === a)!.__collapsed).toBe(false);
    });

    it('부모를 휴지통에 보내면 자식도 같이 · 복원하면 같이 돌아온다', () => {
        const [a, b] = commit(dbId, { addRows: [{ [titleKey]: 'a' }, { [titleKey]: 'b' }] });
        indentRow(b);                       // b 는 a 의 자식
        commit(dbId, { removeRows: [a] });  // 부모만 지운다
        expect(snapshotOf(dbId)!.records).toHaveLength(0);   // 자식도 함께 사라진다(서브트리)
        commit(dbId, { restoreRows: [a] });
        const recs = snapshotOf(dbId)!.records;
        expect(recs).toHaveLength(2);       // 부모·자식 함께 복원
        expect(recs.find((r) => r.id === b)!.__parent).toBe(a);   // 중첩도 그대로
    });
});

describe('snapshotOf', () => {
    it('같은 상태에선 같은 객체(useSyncExternalStore 안정)', () => {
        commit(dbId, { addRows: [{}] });
        expect(snapshotOf(dbId)).toBe(snapshotOf(dbId));
    });
    it('레코드 뷰가 아닌 노드·없는 id 는 null', () => {
        expect(snapshotOf('root')).toBeNull();
        expect(snapshotOf(null)).toBeNull();
    });
    it('records 는 { id, 칸 key: 값 } — 값 없는 제목 칸은 노드 이름(빈 문자열 포함)으로 채운다', () => {
        commit(dbId, { addRows: [{ f_z: 7 }] });
        const rec = snapshotOf(dbId)!.records[0];
        expect(rec.f_z).toBe(7);
        expect(typeof rec.id).toBe('string');
        expect(rec[titleKey]).toBe('');
    });
});
