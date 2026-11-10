/**
 * 노드 다리 — 어댑터(nodes.ts)가 RecordView 의 콜백을 NodesApi 쓰기 묶음(batch)으로 옮기는지.
 *   NodesApi 는 메모리 가짜(실제 탐색기 스토어와 같은 약속) — 묶음 안에서만 쓰는지 · 한 tx = 한 묶음인지를 센다.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { NodesApi, PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';
import { DB_TYPE, ROW_TYPE, commit, liveDbs, liveRelationTargets, registerListType, createDb, getActiveDb, indentRow, initRecordNodes, outdentRow, pickFirstDbIfNone, reorderRow, setActiveDb, restoreTrashedRows, snapshotOf, toggleRowCollapse, trashedRows } from './nodes';
import { blankDb } from './schema';
import { filterUniqueChanges } from './unique';

interface N { id: string; type: string; name: string; children: string[]; data?: unknown; icon?: string; body?: unknown; trashedFrom?: string }

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
    const isTrashed = (id: string): boolean => { for (let p = parentOf(id); p; p = parentOf(p)) if (p === 'trash') return true; return false; };
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
        setIcon: (id, icon) => { write(); nodes.get(id)!.icon = icon; },
        setBody: (id, body) => { write(); nodes.get(id)!.body = body; },
        Header: () => null,
        Frame: () => null,
        Embed: () => null,
        Chip: () => null,
        move: (id, pid, index) => { write(); const from = parentOf(id); if (from) nodes.get(from)!.children = nodes.get(from)!.children.filter((c) => c !== id); const kids = nodes.get(pid)!.children; if (index == null || index >= kids.length) kids.push(id); else kids.splice(Math.max(0, index), 0, id); delete nodes.get(id)!.trashedFrom; },
        remove: (id) => { write(); const from = parentOf(id)!; nodes.get(from)!.children = nodes.get(from)!.children.filter((c) => c !== id); nodes.get(id)!.trashedFrom = from; nodes.get('trash')!.children.push(id); },
        batch: (fn) => { log.batches++; depth++; try { fn(); } finally { depth--; for (const l of listeners) l([]); } },
        invalidate: () => {}, select: () => {}, open: () => {}, promptInput: () => {},
        subscribe: (fn) => { listeners.add(fn); return { dispose() { listeners.delete(fn); } }; },
        roots: { main: 'root', trash: 'trash' },
        isTrashed,
        undoToken: () => null,
        liveByType: (t) => [...nodes.values()].filter((n) => n.type === t && !isTrashed(n.id)) as unknown as PublicNode[],
        cmd: { undo: 'explorer.undo', redo: 'explorer.redo' } as unknown as NodesApi['cmd'],
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

    it('addUnder — 새 행이 db 가 아니라 그 행 밑에 한 묶음으로 생긴다(하위 항목 추가)', () => {
        const [parent] = commit(dbId, { addRows: [{ [titleKey]: '부모' }] });
        env.log.batches = 0;
        const [child] = commit(dbId, { addRows: [{}], addUnder: parent });
        expect(env.api.parent(child)).toBe(parent);
        expect(env.log.batches).toBe(1);
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

describe('P2 — ID 자동 번호·자동 계산 칸', () => {
    it('새 행마다 seq 1씩 · 삭제해도 번호 안 되돌림(건너뜀) · created/updated/id 스냅샷 주입', () => {
        const fields = [
            { key: titleKey, label: '제목', type: 'text' },
            { key: 'f_id', label: 'ID', type: 'id', config: { prefix: '' } },
            { key: 'f_c', label: '생성', type: 'created' },
            { key: 'f_u', label: '편집', type: 'updated' },
        ];
        const [a, b] = commit(dbId, { fields, addRows: [{ [titleKey]: 'a' }, { [titleKey]: 'b' }] });
        const recs1 = snapshotOf(dbId)!.records;
        expect(recs1.find((r) => r.id === a)!.f_id).toBe(1);
        expect(recs1.find((r) => r.id === b)!.f_id).toBe(2);
        expect(typeof recs1.find((r) => r.id === a)!.f_c).toBe('string');   // created 주입
        expect(recs1.find((r) => r.id === a)!.f_u).toBe(recs1.find((r) => r.id === a)!.f_c);
        commit(dbId, { removeRows: [a] });
        const [c] = commit(dbId, { addRows: [{ [titleKey]: 'c' }] });
        expect(snapshotOf(dbId)!.records.find((r) => r.id === c)!.f_id).toBe(3);   // 2 를 건너뛰지 않고 3(삭제분 미복구)
    });
    it('id 는 불변 — 다른 셀을 고쳐도 그대로', () => {
        const [a] = commit(dbId, { addRows: [{ [titleKey]: 'a' }] });
        const before = snapshotOf(dbId)!.records[0].seq;
        commit(dbId, { cells: [{ id: a, key: titleKey, value: '바뀜' }] });
        expect(snapshotOf(dbId)!.records[0].seq).toBe(before);
    });
});

describe('P2 — 수동 순서(reorderRow)', () => {
    it('id 를 beforeId 바로 앞으로 · null 이면 맨 끝 · 배치 한 칸', () => {
        const [a, b, c] = commit(dbId, { addRows: [{ [titleKey]: 'a' }, { [titleKey]: 'b' }, { [titleKey]: 'c' }] });
        env.log.batches = 0;
        reorderRow(dbId, c, a);   // c 를 a 앞으로 → c, a, b
        expect(env.log.batches).toBe(1);
        expect(snapshotOf(dbId)!.records.map((r) => r.id)).toEqual([c, a, b]);
        reorderRow(dbId, c, null); // c 를 맨 끝으로 → a, b, c
        expect(snapshotOf(dbId)!.records.map((r) => r.id)).toEqual([a, b, c]);
    });
    it('트리 모드 — beforeId 의 부모로 재부모화', () => {
        const [a, b, d] = commit(dbId, { addRows: [{ [titleKey]: 'a' }, { [titleKey]: 'b' }, { [titleKey]: 'd' }] });
        indentRow(b);                 // b 는 a 의 자식
        reorderRow(dbId, d, b);       // d 를 b 앞으로 → d 도 a 의 자식
        expect(snapshotOf(dbId)!.records.find((r) => r.id === d)!.__parent).toBe(a);
    });
});

describe('P2 — 하위 행만 휴지통에 보내도 복원 단추가 잡는다', () => {
    it('부모는 살아 있고 자식만 지우면 trashedFrom=부모지만 db 자손으로 포착', () => {
        const [, b] = commit(dbId, { addRows: [{ [titleKey]: 'a' }, { [titleKey]: 'b' }] });
        indentRow(b);                       // b 는 a 의 자식(부모=a 행)
        commit(dbId, { removeRows: [b] });  // 자식만 지운다 → trashedFrom = a(부모 행)
        expect(trashedRows(dbId).map((n) => n.id)).toEqual([b]);   // db 자손이라 잡힌다
        expect(restoreTrashedRows(dbId)).toBe(1);
        expect(snapshotOf(dbId)!.records.some((r) => r.id === b)).toBe(true);
    });
});

describe('리본 「레코드 뷰 열기」 — 첫 화면 고르기', () => {
    it('보던 게 없으면 휴지통 밖 첫 레코드 뷰 · 보던 게 있으면 그대로', () => {
        const folder = env.api.create('root', { type: 'folder', name: '폴더' });
        const inner = env.api.create(folder, { type: DB_TYPE, name: '안쪽', data: blankDb() });
        env.api.remove(dbId);   // 첫 레코드 뷰를 휴지통으로
        env.api.move(folder, 'trash');   // 휴지통 속 폴더 안의 레코드 뷰도 제외
        const live = env.api.create('root', { type: DB_TYPE, name: '산 것', data: blankDb() });
        setActiveDb(null);
        pickFirstDbIfNone();
        expect(getActiveDb()).toBe(live);
        setActiveDb(inner);
        pickFirstDbIfNone();
        expect(getActiveDb()).toBe(inner);
    });
});

describe('줄 문서(body) · 시작 화면 목록', () => {
    it('commit(body) 는 줄 노드 공통 body 칸에 쓰고 칸 값은 그대로 둔다', () => {
        const [rowId] = commit(dbId, { addRows: [{}] });
        commit(dbId, { body: [{ id: rowId, body: { blocks: [{ id: 'b1' }] } }] });
        expect(env.api.get(rowId)?.body).toEqual({ blocks: [{ id: 'b1' }] });
        expect((env.api.get(rowId)?.data as { values?: unknown }).values).toBeDefined();
    });
    it('createDb 는 이름이 겹치면 번호를 붙이고, liveDbs 는 휴지통을 뺀다', () => {
        const a = createDb()!, b = createDb()!;
        const names = liveDbs().map((x) => x.name);
        expect(names).toContain(env.api.get(a)!.name);
        expect(env.api.get(a)!.name).not.toBe(env.api.get(b)!.name);
        env.api.remove(b);
        expect(liveDbs().some((x) => x.id === b)).toBe(false);
    });
    it('관계 칸 대상 후보 = 범용 컬렉션 + 등록된 목록 타입(휴지통 밖 · 이름이 목록 이름과 다르면 「종류 · 이름」)', () => {
        registerListType('qa.list', '큐에이 목록');
        const l1 = env.api.create('root', { type: 'qa.list', name: '큐에이 목록' });
        const l2 = env.api.create('root', { type: 'qa.list', name: '별관' });
        const l3 = env.api.create('root', { type: 'qa.list', name: '버림' });
        env.api.remove(l3);
        const t = liveRelationTargets();
        expect(t[0]).toEqual({ id: dbId, label: '내 뷰' });
        expect(t).toContainEqual({ id: l1, label: '큐에이 목록' });
        expect(t).toContainEqual({ id: l2, label: '큐에이 목록 · 별관' });
        expect(t.some((x) => x.id === l3)).toBe(false);
    });
});

describe('유일 칸 — 노드 다리로 들어오는 모든 쓰기가 같은 검사를 지난다 (R4-3)', () => {
    const withUnique = () => {
        const doc = blankDb();
        doc.fields = [...doc.fields, { key: 'code', label: '코드', type: 'text', unique: true }];
        env.api.setData(dbId, doc);
    };
    it('commit(cells) — 겹치는 값은 안 쓰고, 묶음 안 앞선 변경과도 겹치면 뒤엣것을 뺀다', () => {
        withUnique();
        const [a, b, c] = commit(dbId, { addRows: [{ code: 'A' }, { code: 'B' }, {}] });
        commit(dbId, { cells: [{ id: b, key: 'code', value: ' a ' }, { id: c, key: 'code', value: 'X' }, { id: a, key: 'code', value: 'x' }] });
        const val = (id: string) => (env.api.get(id)?.data as { values: Record<string, unknown> }).values.code;
        expect(val(b)).toBe('B');   // 기존 A 와 겹침
        expect(val(c)).toBe('X');
        expect(val(a)).toBe('A');   // 같은 묶음 앞선 X 와 겹침
    });
    it('휴지통에서 되살릴 줄이 살아 있는 줄과 겹치면 되살리지 않는다', () => {
        withUnique();
        const [a] = commit(dbId, { addRows: [{ code: 'A' }] });
        commit(dbId, { removeRows: [a] });
        commit(dbId, { addRows: [{ code: 'a' }] });
        const msgs: string[] = [];
        expect(restoreTrashedRows(dbId, (t) => msgs.push(t))).toBe(0);
        expect(trashedRows(dbId)).toHaveLength(1);
        expect(msgs).toEqual(['1개 항목은 같은 값이 있어 되살리지 않았습니다 — 휴지통에 그대로 있습니다.']);   // 조용히 빠지지 않는다
    });
    it('겹침이 없으면 알림도 없다', () => {
        const [a] = commit(dbId, { addRows: [{}] });
        commit(dbId, { removeRows: [a] });
        const msgs: string[] = [];
        expect(restoreTrashedRows(dbId, (t) => msgs.push(t))).toBe(1);
        expect(msgs).toEqual([]);
    });
    it('칸이 많아도 변경마다 줄 전체를 다시 훑지 않는다 — 큰 묶음이 짧게 끝난다', () => {
        const { kept, rejected } = filterUniqueChanges(
            Array.from({ length: 3000 }, (_, i) => ({ id: `r${i}`, key: 'k', value: `v${i}` })),
            Array.from({ length: 3000 }, (_, i) => `r${i}`), () => undefined, new Set(['k']));
        expect(kept).toHaveLength(3000);
        expect(rejected).toHaveLength(0);
    });
});
