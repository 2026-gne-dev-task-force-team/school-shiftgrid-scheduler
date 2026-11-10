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
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Disposable, MenuEntry, NodeTypeContribution, PluginHost } from '../../pane-ui-system/plugin';
import type { DbDoc, RecordCellValue, RecordField, RowDoc, ViewDef } from './contracts/collection';
import { uniqueKeyOf } from './unique';
import { DB_TYPE, ROW_TYPE, blankDb, blankRow, isoMinute, normalizeDb, normalizeRow } from './schema';
import { DbEmbed } from './views/DbEmbed';

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
    const first = a.liveByType(DB_TYPE)[0];
    if (first) setActiveDb(first.id);
}

/** 시작 화면 목록 — 휴지통 밖 레코드 뷰 전부(나무 순서) + 든 폴더 이름(맨 위면 없음). */
export function liveDbs(): { id: string; name: string; folder: string | null }[] {
    const a = api;
    if (!a) return [];
    return a.liveByType(DB_TYPE).map((n) => {
        const p = a.parent(n.id);
        return { id: n.id, name: n.name, folder: p && p !== a.roots.main ? (a.get(p)?.name ?? null) : null };
    });
}
// defineCollection 이 꽂는 목록 타입(타입 → 목록 이름) — 관계 칸 「가리킬 컬렉션」 후보에 범용 컬렉션과 같이 낸다.
const listTypes = new Map<string, string>();
export function registerListType(type: string, label: string): void { listTypes.set(type, label); }
/** 관계 칸 대상 후보 — 범용 컬렉션 + defineCollection 목록들(휴지통 밖). 목록은 이름 앞에 종류(「방 목록 · 본관 동」 꼴). */
export function liveRelationTargets(): { id: string; label: string }[] {
    const a = api;
    const dbs = liveDbs().map((d) => ({ id: d.id, label: d.folder ? `${d.folder} / ${d.name}` : d.name }));
    if (!a) return dbs;
    const lists = [...listTypes].flatMap(([type, label]) => a.liveByType(type).map((n) => ({ id: n.id, label: n.name === label ? label : `${label} · ${n.name}` })));
    return [...dbs, ...lists];
}
/** 시작 화면 「새 레코드 뷰」 — 탐색기 맨 위에 빈 레코드 뷰 하나. 이름이 겹치면 「레코드 뷰 2」… 못 만들면 null. */
export function createDb(): string | null {
    const a = api;
    if (!a) return null;
    const names = new Set(a.liveByType(DB_TYPE).map((n) => n.name));
    let name = '컬렉션';
    for (let i = 2; names.has(name); i++) name = `컬렉션 ${i}`;
    return a.create(a.roots.main, { type: DB_TYPE, name, data: blankDb() }) || null;
}

/** 노드 타입 함수 묶음(선언형) — contributes.nodeTypes 의 impl 이름('db')이 가리킨다. */
export const recordNodeTypeImpl = {
    db: {
        open: (host: PluginHost, id: string) => {
            setActiveDb(id);
            host.workspace.open(DB_VIEW_ID, { where: 'center' });
        },
        createInit: () => ({ data: blankDb() }),
        // R3-E 끼워 넣기 — 기본은 링크 한 줄, view 'inline' 이면 표가 그 자리에서 편집된다(페이지 「본문에 펼치기」)
        embed: DbEmbed,
        menu: (_host: PluginHost, id: string): MenuEntry[] => {
            const n = trashedRows(id).length;
            return n > 0 ? [{ label: `휴지통의 행 ${n}개 복원`, icon: 'undo', commandId: 'collection.restoreTrashed', commandArg: { nodeId: id } }] : [];
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
        type: DB_TYPE, body: 'collection', label: '컬렉션', icon: 'database',
        openable: true, container: { accepts: [ROW_TYPE] },
        create: { label: '컬렉션', under: ['folder'] },
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
/** 이전 스냅샷의 레코드 객체 — 행 노드 data·이름·부모·칸 정의가 그대로면 같은 객체를 돌려준다(행 컴포넌트 메모가 먹도록, #50) */
/** 칸·보기 정의는 행을 더할 때마다 새로 정규화돼 새 배열이 되지만 내용은 같다 — 내용이 같으면 앞 배열을 그대로 돌려줘 화면 메모(행·칸 머리)가 안 깨진다 */
const defMemo = new Map<string, { fields: DbDoc['fields']; fj: string; views: DbDoc['views']; vj: string }>();
function stableDoc(id: string, doc: DbDoc): DbDoc {
    const fj = JSON.stringify(doc.fields), vj = JSON.stringify(doc.views);
    const prev = defMemo.get(id);
    const fields = prev && prev.fj === fj ? prev.fields : doc.fields;
    const views = prev && prev.vj === vj ? prev.views : doc.views;
    defMemo.set(id, { fields, fj, views, vj });
    return fields === doc.fields && views === doc.views ? doc : { ...doc, fields, views };
}
const recMemo = new Map<string, { rec: { id: string } & Record<string, unknown>; data: unknown; name: string; parent: string | null; fields: DbDoc['fields']; titleKey: string }>();

export function snapshotOf(id: string | null): DbSnapshot | null {
    if (!api || !id) return null;
    if (snapCache && snapCache.rev === rev && snapCache.id === id) return snapCache.snap;
    const n = api.get(id);
    let snap: DbSnapshot | null = null;
    if (n && n.type === DB_TYPE) {
        const doc = stableDoc(id, docOfNode(n));
        // 🔴 행이 행을 품는다(하위 항목) — db 아래 모든 자손 행을 훑어 __parent(부모 행 id · db 직속이면 null)와 __collapsed 를 싣는다.
        const a = api;
        const records: ({ id: string } & Record<string, unknown>)[] = [];
        const nextMemo = new Map<string, NonNullable<ReturnType<typeof recMemo.get>>>();
        const walk = (parentNodeId: string, parentRowId: string | null) => {
            for (const c of a.children(parentNodeId)) {
                if (c.type !== ROW_TYPE) continue;
                const hit = recMemo.get(c.id);
                if (hit && hit.data === c.data && hit.name === c.name && hit.parent === parentRowId && hit.fields === doc.fields && hit.titleKey === doc.titleKey) {
                    records.push(hit.rec);
                    nextMemo.set(c.id, hit);
                    walk(c.id, c.id);
                    continue;
                }
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
                nextMemo.set(c.id, { rec, data: c.data, name: c.name, parent: parentRowId, fields: doc.fields, titleKey: doc.titleKey });
                walk(c.id, c.id);
            }
        };
        walk(id, null);
        recMemo.clear();
        for (const [k, v] of nextMemo) recMemo.set(k, v);
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
    /** 목록 설명(검수 K1) — 빈 글자면 지운다 */
    description?: string;
    fields?: RecordField[];
    views?: ViewDef[];
    /** 셀 값 바꾸기 */
    cells?: { id: string; key: string; value: RecordCellValue }[];
    /** 새 행들 — 칸 key → 값. 제목 칸 값은 노드 이름이 된다 */
    addRows?: Record<string, RecordCellValue>[];
    /** 새 행을 db 가 아니라 이 행(노드) 밑에 만든다 — 「하위 항목 추가」 */
    addUnder?: string;
    removeRows?: string[];
    restoreRows?: string[];
    /** 줄 문서(불투명) 바꾸기 — 페이지 문서가 쓴다. 레코드 뷰는 속을 안 읽는다 */
    body?: { id: string; body: unknown }[];
}

const titleText = (v: RecordCellValue | undefined): string => (v === null || v === undefined ? '' : String(v));

function uniqueKeysOf(doc: DbDoc): Set<string> {
    return new Set(doc.fields.filter((f) => f.unique).map((f) => f.key));
}

/** 줄의 칸 값(제목 칸은 값이 없으면 노드 이름) — 유일 비교용 */
function cellOf(row: PublicNode, doc: DbDoc, key: string): RecordCellValue | undefined {
    const v = rowOfNode(row).values[key];
    return v !== undefined ? v : key === doc.titleKey ? row.name : undefined;
}

function liveRowNodes(dbId: string): PublicNode[] {
    const a = api;
    if (!a) return [];
    const out: PublicNode[] = [];
    const walk = (p: string) => { for (const c of a.children(p)) if (c.type === ROW_TYPE) { out.push(c); walk(c.id); } };
    walk(dbId);
    return out;
}

/** 셀 변경에서 유일 칸을 어기는 것을 뺀다 — unique.ts 의 filterUniqueChanges 와 같은 규칙(장부는 값→id Map). */
function filterCellsUnique(dbId: string, doc: DbDoc, cells: DbTx['cells'] & object): NonNullable<DbTx['cells']> {
    const keys = uniqueKeysOf(doc);
    if (keys.size === 0 || !cells.some((c) => keys.has(c.key))) return cells;
    const rows = liveRowNodes(dbId);
    const ledgers = new Map<string, Map<string, string>>();   // 칸 key → (비교키 → 줄 id)
    const owner = new Map<string, Map<string, string | null>>();   // 칸 key → (줄 id → 지금 비교키)
    const ledger = (key: string) => {
        let m = ledgers.get(key);
        if (!m) {
            m = new Map(); const o = new Map<string, string | null>();
            for (const r of rows) { const k = uniqueKeyOf(cellOf(r, doc, key)); o.set(r.id, k); if (k !== null && !m.has(k)) m.set(k, r.id); }
            ledgers.set(key, m); owner.set(key, o);
        }
        return { m, o: owner.get(key)! };
    };
    const kept: NonNullable<DbTx['cells']> = [];
    for (const c of cells) {
        if (!keys.has(c.key)) { kept.push(c); continue; }
        const { m, o } = ledger(c.key);
        const k = uniqueKeyOf(c.value);
        if (k !== null) { const hit = m.get(k); if (hit && hit !== c.id) continue; }
        const old = o.get(c.id) ?? null;
        if (old !== null && m.get(old) === c.id) m.delete(old);
        if (k !== null) m.set(k, c.id);
        o.set(c.id, k);
        kept.push(c);
    }
    return kept;
}

/** 휴지통에서 되살릴 줄이 지금 살아 있는 줄과 유일 칸이 겹치나 — 겹치면 되살리지 않는다(휴지통에 그대로 있다). */
function restoreConflicts(dbId: string, doc: DbDoc, rowId: string): boolean {
    const keys = uniqueKeysOf(doc);
    const a = api;
    const rn = a?.get(rowId);
    if (keys.size === 0 || !rn) return false;
    const live = liveRowNodes(dbId);
    for (const key of keys) {
        const k = uniqueKeyOf(cellOf(rn, doc, key));
        if (k !== null && live.some((r) => uniqueKeyOf(cellOf(r, doc, key)) === k)) return true;
    }
    return false;
}

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
        // 🔴 「유일」 칸 — 화면(RecordView·RecordPage)이 먼저 걸러도, 노드 다리로 들어오는 모든 쓰기가 같은 검사를 지난다
        //    (줄 문서·속성 패널·되살리기 …). 값→줄 장부는 칸마다 한 번만 만든다(변경마다 줄 전체를 훑지 않는다).
        const cells = filterCellsUnique(dbId, doc, tx.cells ?? []);
        for (const c of cells) {
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
            const id = a.create(tx.addUnder ?? dbId, { type: ROW_TYPE, name: titleText(values[doc.titleKey]), data });
            if (id) created.push(id);
        }
        if (tx.fields || tx.views || addRows.length > 0 || tx.description !== undefined) {
            const next: DbDoc = { ...doc, fields: tx.fields ?? doc.fields, views: tx.views ?? doc.views, seq };
            if (tx.description !== undefined) { if (tx.description.trim()) next.description = tx.description.trim(); else delete next.description; }
            a.setData(dbId, next);
        }
        for (const b of tx.body ?? []) {
            const rn = a.get(b.id);
            if (!rn || rn.type !== ROW_TYPE) continue;
            a.setBody(b.id, b.body);   // 본문은 노드 공통 body 칸 — 행 data 는 수정 시각만
            a.setData(b.id, { ...rowOfNode(rn), updated: now });
        }
        for (const id of tx.removeRows ?? []) a.remove(id);
        for (const id of tx.restoreRows ?? []) if (!restoreConflicts(dbId, doc, id)) a.move(id, dbId);
    });
    return created;
}

/** 휴지통의 행을 전부 되살린다 — 메뉴·화면 단추가 같이 쓴다. 유일 칸이 겹쳐 못 돌아온 줄이 있으면 notify 로 알린다(조용히 빠지지 않게). */
export function restoreTrashedRows(dbId: string, notify?: (title: string) => void): number {
    const rows = trashedRows(dbId);
    if (rows.length === 0) return 0;
    commit(dbId, { restoreRows: rows.map((r) => r.id) });
    const restored = rows.length - trashedRows(dbId).length;   // 유일 칸이 겹쳐 못 돌아온 줄은 센 수에서 빠진다
    const skipped = rows.length - restored;
    if (skipped > 0) notify?.(`${skipped}개 항목은 같은 값이 있어 되살리지 않았습니다 — 휴지통에 그대로 있습니다.`);
    return restored;
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

/** 끌어서 하위로(Q8) — 행을 다른 행의 마지막 자식으로. 자기 자신·자기 자손 밑은 막는다(순환). */
export function moveRowUnder(rowId: string, parentRowId: string): void {
    if (!api || rowId === parentRowId) return;
    const a = api;
    a.batch(() => {
        const pn = a.get(parentRowId);
        if (!pn || pn.type !== ROW_TYPE || a.get(rowId)?.type !== ROW_TYPE) return;
        for (let cur: string | null = parentRowId, n = 0; cur && n < 10000; cur = a.parent(cur), n++) if (cur === rowId) return;
        a.move(rowId, parentRowId);
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
