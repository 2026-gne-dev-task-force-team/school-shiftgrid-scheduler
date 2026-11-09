/**
 * 레코드 뷰 ↔ 노드 시스템 다리 — 🔴 레코드 뷰 하나도, 그 행 하나하나도 노드다. 저장·휴지통·복원·되돌리기는 노드 시스템이 쥔다.
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 *   ⭐ 어댑터 한 장 — 노드를 아는 건 이 파일뿐이다. RecordView 는 records·콜백만 안다(저장소를 갈아 끼워도 화면은 그대로).
 *
 * 이 모듈이 쥐는 것:
 *   ① 노드 타입 둘(collection.db 열 수 있음 · collection.row 레코드성) — index.ts 가 contributes 로 꽂는다
 *   ② NodesApi 참조 + subscribe 로 「노드가 바뀌었다」를 뷰에 알린다(useSyncExternalStore · 스냅샷은 바뀔 때만 새로 짓는다)
 *   ③ 쓰기는 전부 commit(tx) 한 함수를 지난다 — 한 tx = NodesApi.batch 한 칸 = 되돌리기 한 번
 */
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../explorer/contracts/nodes';
import type { Disposable, MenuEntry, NodeTypeContribution, PluginHost } from '../../pane-ui-system/plugin';
import type { DbDoc, RecordCellValue, RecordField, RowDoc, ViewDef } from './contracts/collection';
import { DB_TYPE, ROW_TYPE, blankDb, blankRow, isoMinute, normalizeDb, normalizeRow } from './schema';

export { DB_TYPE, ROW_TYPE };

// 🔴 viewId 접두사 = 플러그인 id(host 가 'collection.' 를 붙인다). 레코드 뷰를 열면 여는 화면.
const DB_VIEW_ID = 'collection.db';

// ── 보고 있는 레코드 뷰(저장 안 함 — 표 편집기와 같은 결) ──
let activeDbId: string | null = null;
export function setActiveDb(id: string | null): void {
    if (activeDbId === id) return;
    activeDbId = id;
    bump();
}
export function getActiveDb(): string | null { return activeDbId; }
/** 리본 「레코드 뷰 열기」 — 보고 있는 게 없으면 나무의 첫 레코드 뷰(휴지통 안 제외)를 잡는다. 하나도 없으면 화면이 안내를 띄운다. */
export function pickFirstDbIfNone(): void {
    const a = api;
    if (activeDbId || !a) return;
    const inTrash = (id: string): boolean => {
        for (let p = a.parent(id); p; p = a.parent(p)) if (p === a.roots.trash) return true;
        return false;
    };
    const first = a.byType(DB_TYPE).find((n) => !inTrash(n.id));
    if (first) setActiveDb(first.id);
}

/** 시작 화면 목록 — 휴지통 밖 레코드 뷰 전부(나무 순서) + 든 폴더 이름(맨 위면 없음). */
export function liveDbs(): { id: string; name: string; folder: string | null }[] {
    const a = api;
    if (!a) return [];
    const inTrash = (id: string): boolean => { for (let p = a.parent(id); p; p = a.parent(p)) if (p === a.roots.trash) return true; return false; };
    return a.byType(DB_TYPE).filter((n) => !inTrash(n.id)).map((n) => {
        const p = a.parent(n.id);
        return { id: n.id, name: n.name, folder: p && p !== a.roots.main ? (a.get(p)?.name ?? null) : null };
    });
}
/** 시작 화면 「새 레코드 뷰」 — 탐색기 맨 위에 빈 레코드 뷰 하나. 이름이 겹치면 「레코드 뷰 2」… 못 만들면 null. */
export function createDb(): string | null {
    const a = api;
    if (!a) return null;
    const names = new Set(a.byType(DB_TYPE).map((n) => n.name));
    let name = '레코드 뷰';
    for (let i = 2; names.has(name); i++) name = `레코드 뷰 ${i}`;
    return a.create(a.roots.main, { type: DB_TYPE, name, data: blankDb() }) || null;
}

// ── 우클릭 메뉴가 가리킨 레코드 뷰 — 메뉴 항목은 commandId 만 싣는다(달력 저장소와 같은 결) ──
let menuTargetId: string | null = null;
export function getMenuTarget(): string | null { return menuTargetId; }

/** 노드 타입 함수 묶음(선언형) — contributes.nodeTypes 의 impl 이름('db')이 가리킨다. */
export const recordNodeTypeImpl = {
    db: {
        open: (host: PluginHost, id: string) => {
            setActiveDb(id);
            host.workspace.open(DB_VIEW_ID, { where: 'center' });
        },
        createInit: () => ({ data: blankDb() }),
        menu: (_host: PluginHost, id: string): MenuEntry[] => {
            menuTargetId = id;
            const n = trashedRows(id).length;
            return n > 0 ? [{ label: `휴지통의 행 ${n}개 복원`, icon: 'undo', commandId: 'collection.restoreTrashed' }] : [];
        },
    } satisfies NodeTypeImplFns,
};

/**
 * 타입 둘 — 🔴 레코드 리터럴(record: true)은 여기(비-뷰)에 산다(구조 검사 ⑯: 뷰엔 소문자 record 금지).
 *   레코드 뷰: 열 수 있음 · 행만 자식으로 받음 · 우클릭 「새로 만들기 ▸ 레코드 뷰」 · 함수는 impl 'db'.
 *   행: record: true — 탐색기에 어떤 경우에도 안 보인다(레코드 뷰의 데이터다). 저장·휴지통·되돌리기는 일반 노드와 같다.
 */
export const recordNodeTypes: NodeTypeContribution<'db'>[] = [
    {
        type: DB_TYPE, body: 'collection', label: '레코드 뷰', icon: 'table',
        openable: true, container: { accepts: [ROW_TYPE] },
        create: { label: '레코드 뷰', under: ['folder'] },
        impl: 'db',
    },
    // 🔴 행도 행을 자식으로 받는다 — 하위 항목(행 밑에 행)은 노드 중첩이다. 휴지통·복원·되돌리기는 서브트리째 공짜.
    { type: ROW_TYPE, label: '행', icon: 'file', record: true, container: { accepts: [ROW_TYPE] } },
];

// ── 다리 상태 ──
let api: NodesApi | null = null;
const subs = new Set<() => void>();
let rev = 0;

function bump(): void { rev++; for (const s of subs) s(); }

/** 활성(index.ts)이 한 번 — NodesApi 를 쥐고 구독을 건다(없으면 조용히 빈 상태). */
export function initRecordNodes(nodes: NodesApi | null): Disposable | null {
    api = nodes;
    bump();
    if (!nodes) return null;
    return nodes.subscribe(() => bump());
}
export function getNodesApi(): NodesApi | null { return api; }
export function subscribeDb(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getDbRev(): number { return rev; }

// ── 읽기 ──
const dbCache = new WeakMap<object, DbDoc>();
const rowCache = new WeakMap<object, RowDoc>();

function docOfNode(n: PublicNode): DbDoc {
    const d = n.data;
    if (d && typeof d === 'object') {
        const hit = dbCache.get(d);
        if (hit) return hit;
        const doc = normalizeDb(d);
        dbCache.set(d, doc);
        return doc;
    }
    return normalizeDb(d);
}
function rowOfNode(n: PublicNode): RowDoc {
    const d = n.data;
    if (d && typeof d === 'object') {
        const hit = rowCache.get(d);
        if (hit) return hit;
        const row = normalizeRow(d);
        rowCache.set(d, row);
        return row;
    }
    return normalizeRow(d);
}

/** 화면이 읽는 한 장 — 같은 rev 에선 같은 객체를 돌려준다(useSyncExternalStore 스냅샷 안정). */
export interface DbSnapshot {
    id: string;
    name: string;
    doc: DbDoc;
    /** RecordView 에 넘기는 행들 — { id, [칸 key]: 값 }. 제목 칸은 값이 없으면 노드 이름으로 */
    records: ({ id: string } & Record<string, unknown>)[];
    trashedRows: number;
}

let snapCache: { rev: number; id: string; snap: DbSnapshot | null } | null = null;

export function snapshotOf(id: string | null): DbSnapshot | null {
    if (!api || !id) return null;
    if (snapCache && snapCache.rev === rev && snapCache.id === id) return snapCache.snap;
    const n = api.get(id);
    let snap: DbSnapshot | null = null;
    if (n && n.type === DB_TYPE) {
        const doc = docOfNode(n);
        // 🔴 행이 행을 품는다(하위 항목) — db 아래 모든 자손 행을 훑어 __parent(부모 행 id · db 직속이면 null)와 __collapsed 를 싣는다.
        const a = api;
        const records: ({ id: string } & Record<string, unknown>)[] = [];
        const walk = (parentNodeId: string, parentRowId: string | null) => {
            for (const c of a.children(parentNodeId)) {
                if (c.type !== ROW_TYPE) continue;
                const row = rowOfNode(c);
                const rec: { id: string } & Record<string, unknown> = { ...row.values, id: c.id, __parent: parentRowId, __collapsed: row.collapsed === true };
                // 자동 계산 칸은 값이 행 노드에 있다(values 가 아님) — 칸 key 로 꽂아 준다.
                for (const f of doc.fields) {
                    if (f.type === 'created') rec[f.key] = row.created;
                    else if (f.type === 'updated') rec[f.key] = row.updated;
                    else if (f.type === 'id' && typeof row.seq === 'number') rec[f.key] = row.seq;
                }
                if (rec[doc.titleKey] === undefined || rec[doc.titleKey] === null) rec[doc.titleKey] = c.name;
                records.push(rec);
                walk(c.id, c.id);
            }
        };
        walk(id, null);
        snap = { id, name: n.name, doc, records, trashedRows: trashedRows(id).length };
    }
    snapCache = { rev, id, snap };
    return snap;
}

/**
 * 이 레코드 뷰에서 지워져 휴지통에 있는 행들 — 레코드성 노드는 탐색기 휴지통 구역에 안 보이니 여기서 되살린다.
 *   🔴 하위 행을 하나만 지우면 trashedFrom 은 db 가 아니라 「부모 행 id」다 — db 아래 살아 있는 행에서 지운 것도 잡는다.
 */
export function trashedRows(dbId: string): PublicNode[] {
    if (!api) return [];
    const a = api;
    const inDb = new Set<string>([dbId]);
    const walk = (p: string) => { for (const c of a.children(p)) if (c.type === ROW_TYPE) { inDb.add(c.id); walk(c.id); } };
    walk(dbId);
    return a.children(a.roots.trash).filter((n) => n.type === ROW_TYPE && !!n.trashedFrom && inDb.has(n.trashedFrom));
}

/**
 * 수동 순서 — id 를 beforeId 바로 앞으로(맨 끝이면 beforeId=null). 트리 모드에선 beforeId 의 부모로 재부모화.
 *   한 묶음(batch) = 되돌리기 한 칸. 정렬·필터가 걸리면 화면이 손잡이를 안 띄우니 여긴 호출 안 된다.
 */
export function reorderRow(dbId: string, id: string, beforeId: string | null): void {
    if (!api || id === beforeId) return;
    const a = api;
    a.batch(() => {
        if (!beforeId) { a.move(id, dbId); return; }   // 맨 끝 → db 직속 마지막
        const parent = a.parent(beforeId);
        if (!parent) return;
        // move 는 id 를 뺀 배열 기준 index 에 꽂는다 — beforeId 의 자리가 곧 「그 앞」
        const sibs = a.children(parent).filter((c) => c.id !== id);
        const at = sibs.findIndex((c) => c.id === beforeId);
        a.move(id, parent, at < 0 ? undefined : at);
    });
}

// ── 쓰기 — 전부 commit(tx) 한 함수를 지난다 ──
export interface DbTx {
    fields?: RecordField[];
    views?: ViewDef[];
    /** 셀 값 바꾸기 */
    cells?: { id: string; key: string; value: RecordCellValue }[];
    /** 새 행들 — 칸 key → 값. 제목 칸 값은 노드 이름이 된다 */
    addRows?: Record<string, RecordCellValue>[];
    removeRows?: string[];
    restoreRows?: string[];
    /** 줄 문서(불투명) 바꾸기 — 페이지 문서가 쓴다. 레코드 뷰는 속을 안 읽는다 */
    body?: { id: string; body: unknown }[];
}

const titleText = (v: RecordCellValue | undefined): string => (v === null || v === undefined ? '' : String(v));

/** 한 묶음으로 쓴다 — 되돌리기 한 번. 새로 만든 행 id 들을 돌려준다. */
export function commit(dbId: string, tx: DbTx): string[] {
    const created: string[] = [];
    if (!api) return created;
    const a = api;
    a.batch(() => {
        const n = a.get(dbId);
        if (!n || n.type !== DB_TYPE) return;
        const doc = docOfNode(n);
        const now = isoMinute();
        // 셀 — 행마다 한 번만 쓴다(같은 행의 여러 칸을 모은다)
        const byRow = new Map<string, Map<string, RecordCellValue>>();
        for (const c of tx.cells ?? []) {
            if (!byRow.has(c.id)) byRow.set(c.id, new Map());
            byRow.get(c.id)!.set(c.key, c.value);
        }
        for (const [rowId, kv] of byRow) {
            const rn = a.get(rowId);
            if (!rn || rn.type !== ROW_TYPE) continue;
            const row = rowOfNode(rn);
            const values = { ...row.values };
            for (const [k, v] of kv) values[k] = v;
            a.setData(rowId, { ...row, values, updated: now });
            // 제목 칸 = 노드 이름 — 탐색기 검색·관계 알약이 이 이름을 쓴다. 비면 rename 이 무시하니 옛 이름이 남는다(값은 values 에 있다)
            if (kv.has(doc.titleKey) && titleText(kv.get(doc.titleKey)).trim() !== '') a.rename(rowId, titleText(kv.get(doc.titleKey)));
        }
        // ID 칸 자동 번호 — 새 행마다 doc.seq 에서 하나씩(삭제돼도 안 되돌림). 번호는 행에 박혀 불변.
        const addRows = tx.addRows ?? [];
        let seq = doc.seq;
        for (const values of addRows) {
            const data = blankRow(values);
            data.seq = seq;
            seq += 1;
            const id = a.create(dbId, { type: ROW_TYPE, name: titleText(values[doc.titleKey]), data });
            if (id) created.push(id);
        }
        if (tx.fields || tx.views || addRows.length > 0) {
            a.setData(dbId, { ...doc, fields: tx.fields ?? doc.fields, views: tx.views ?? doc.views, seq });
        }
        for (const b of tx.body ?? []) {
            const rn = a.get(b.id);
            if (!rn || rn.type !== ROW_TYPE) continue;
            a.setBody(b.id, b.body);   // 본문은 노드 공통 body 칸 — 행 data 는 수정 시각만
            a.setData(b.id, { ...rowOfNode(rn), updated: now });
        }
        for (const id of tx.removeRows ?? []) a.remove(id);
        for (const id of tx.restoreRows ?? []) a.move(id, dbId);
    });
    return created;
}

/** 휴지통의 행을 전부 되살린다 — 메뉴·화면 단추가 같이 쓴다. */
export function restoreTrashedRows(dbId: string): number {
    const rows = trashedRows(dbId);
    if (rows.length === 0) return 0;
    commit(dbId, { restoreRows: rows.map((r) => r.id) });
    return rows.length;
}

// ── 하위 항목(행 밑에 행) 구조 조작 — 전부 노드 move/setData 한 번(되돌리기 한 칸) ──

/** 접기/펼치기 — 레코드성 행은 노드 collapsed(탐색기 전용)를 못 쓰니 RowDoc.collapsed 로 둔다. */
export function toggleRowCollapse(rowId: string): void {
    if (!api) return;
    const a = api;
    a.batch(() => {
        const n = a.get(rowId);
        if (!n || n.type !== ROW_TYPE) return;
        const row = rowOfNode(n);
        a.setData(rowId, { ...row, collapsed: !(row.collapsed === true) });
    });
}

/** 들여쓰기 — 바로 위 형제의 마지막 자식으로. 첫 형제(위 형제 없음)는 아무 일 없음. */
export function indentRow(rowId: string): void {
    if (!api) return;
    const a = api;
    a.batch(() => {
        const parent = a.parent(rowId);
        if (!parent) return;
        const sibs = a.children(parent).filter((c) => c.type === ROW_TYPE);
        const idx = sibs.findIndex((c) => c.id === rowId);
        if (idx <= 0) return;
        a.move(rowId, sibs[idx - 1].id);
    });
}

/** 내어쓰기 — 부모 행의 바로 다음 형제로. 이미 뿌리(db 직속)면 아무 일 없음. */
export function outdentRow(rowId: string): void {
    if (!api) return;
    const a = api;
    a.batch(() => {
        const parent = a.parent(rowId);
        if (!parent) return;
        const pNode = a.get(parent);
        if (!pNode || pNode.type !== ROW_TYPE) return;   // 부모가 db 면 이미 뿌리
        const grand = a.parent(parent);
        if (!grand) return;
        const gsibs = a.children(grand);
        const pIdx = gsibs.findIndex((c) => c.id === parent);
        a.move(rowId, grand, pIdx < 0 ? undefined : pIdx + 1);
    });
}
