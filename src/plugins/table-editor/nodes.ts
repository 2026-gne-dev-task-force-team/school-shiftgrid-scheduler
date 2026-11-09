/**
 * 표 편집기 ↔ 노드 시스템 다리 — 🔴 표 한 장도 노드다. 저장·휴지통·복원은 노드 시스템이 쥔다(달력·명단 다리와 같은 규칙).
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 *
 * 이 모듈이 쥐는 것:
 *   ① 노드 타입 하나 등록(table-editor.table — 열면 표 화면) — index.ts 가 contributes 로 꽂는다
 *   ② NodesApi 참조 + subscribe 로 「표 노드가 바뀌었다」를 뷰에 알린다(뷰가 useSyncExternalStore 로 읽는다)
 *   ③ 표 문서(TableDoc) 읽기·쓰기 — 트랜잭션(TableTx)을 순수 함수로 문서에 적용한 뒤 setData
 *
 * 🔴 TableDoc 은 그 노드의 불투명 data 다 — 탐색기는 안 본다(설계 「data 는 그 타입 주인 것」).
 */
// 🔴 import type 만 — 약속 타입은 약속 플러그인의 contracts 에서(값 아님, 구조 검사 ⑱·d·g). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../project-explorer/contracts/nodes';
import type { Disposable, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { uniqueName } from '../../pane-ui-system';
import type { CellTone, MergeRegion, TableStylePreset, TableTx } from './contracts/table';
import { setActiveTable } from './store';

export const TABLE_TYPE = 'table-editor.table';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'table-editor.' 를 붙인다). 표를 열면 여는 표 화면.
const SHEET_ID = 'table-editor.sheet';

/** 표 노드에 저장되는 문서 — 열·줄·병합 + 노션식 머리·색. */
export interface TableDoc {
    cols: { key: string; title: string }[];
    rows: { id: string; cells: Record<string, string> }[];
    merges: MergeRegion[];
    headerRow?: boolean;
    headerCol?: boolean;
    /** M5 넘버스 — 꼬리 행 · 표 스타일 프리셋. */
    footerRow?: boolean;
    style?: TableStylePreset;
    rowTones?: Record<string, CellTone>;
    colTones?: Record<string, CellTone>;
}

let docSeq = 0;
function nid(prefix: string): string { return `${prefix}${Date.now().toString(36)}${docSeq++}`; }

/** 빈 표 — 3×3, 머리 행 켬(노션 단순 표의 처음 꼴). */
export function blankTable(): TableDoc {
    const cols = [0, 1, 2].map((i) => ({ key: nid('c'), title: `칸 ${i + 1}` }));
    const rows = [0, 1, 2].map(() => ({ id: nid('r'), cells: {} as Record<string, string> }));
    return { cols, rows, merges: [], headerRow: true };
}

/** 트랜잭션을 문서에 적용(순수) — 소유자(이 다리)가 할 일. 편집기는 데이터를 안 들고 있다. */
export function applyTx(doc: TableDoc, tx: TableTx): TableDoc {
    let rows = doc.rows.map((r) => ({ ...r, cells: { ...r.cells } }));
    let cols = doc.cols.map((c) => ({ ...c }));
    let merges = doc.merges.map((m) => ({ ...m }));

    for (const c of tx.cells) { const row = rows.find((r) => r.id === c.rowId); if (row) row.cells[c.key] = c.value; }
    if (tx.rows?.remove) rows = rows.filter((r) => !tx.rows!.remove!.includes(r.id));
    for (const a of tx.rows?.add ?? []) {
        const list = a.cells ?? Array.from({ length: a.count }, () => ({}));
        const ins = list.map((cells, i) => ({ id: a.ids?.[i] ?? nid('r'), cells: { ...cells } }));
        rows.splice(a.at, 0, ...ins);
    }
    for (const m of tx.rows?.move ?? []) {
        const i = rows.findIndex((r) => r.id === m.id);
        if (i >= 0) { const [row] = rows.splice(i, 1); rows.splice(Math.min(m.to, rows.length), 0, row); }
    }
    for (const a of tx.cols?.add ?? []) cols.splice(a.at, 0, { key: a.key, title: a.title });
    if (tx.cols?.remove) cols = cols.filter((c) => !tx.cols!.remove!.includes(c.key));
    for (const rn of tx.cols?.rename ?? []) { const col = cols.find((c) => c.key === rn.key); if (col) col.title = rn.title; }
    for (const m of tx.cols?.move ?? []) {
        const i = cols.findIndex((c) => c.key === m.key);
        if (i >= 0) { const [col] = cols.splice(i, 1); cols.splice(Math.min(m.to, cols.length), 0, col); }
    }
    for (const s of tx.merge?.set ?? []) { merges = merges.filter((m) => !(m.rowId === s.rowId && m.key === s.key)); merges.push({ ...s }); }
    for (const cl of tx.merge?.clear ?? []) merges = merges.filter((m) => !(m.rowId === cl.rowId && m.key === cl.key));

    return { ...doc, rows, cols, merges };
}

// ── 다리 상태(모듈 전역 — 달력·명단 nodes.ts 와 같은 결) ──
let api: NodesApi | null = null;
const subs = new Set<() => void>();
let rev = 0;   // 노드가 바뀔 때마다 는다 — 뷰 useSyncExternalStore 의 스냅샷

/**
 * 🔴 노드 타입 함수 묶음(선언형) — contributes.nodeTypes 의 impl 이름('table')이 가리킨다.
 *   · open — 표를 열면 「보고 있는 표」를 그걸로 두고 표 화면을 가운데에.
 *   · createInit — 새 표를 만들면 빈 3×3(머리 행 켬) 문서를 심는다.
 */
export const tableNodeTypeImpl = {
    table: {
        open: (host: PluginHost, id: string) => {
            setActiveTable(id);
            host.workspace.open(SHEET_ID, { where: 'center' });
        },
        createInit: () => ({ data: blankTable() }),
    } satisfies NodeTypeImplFns,
};

/** 표 노드 타입 하나 — 파일 역할(열면 표 화면). 폴더·다른 표 밑에 만들 수 있다. */
export const tableNodeTypes: NodeTypeContribution<'table'>[] = [
    {
        type: TABLE_TYPE, label: '표', icon: 'table',
        openable: true,
        create: { label: '표', under: ['folder', TABLE_TYPE] },
        impl: 'table',
    },
];

/** 활성(index.ts)이 한 번 — NodesApi 를 쥐고 구독을 건다(없으면 조용히 빈 상태). 돌려준 Disposable 은 호스트가 회수. */
export function initTableNodes(nodes: NodesApi | null): Disposable | null {
    api = nodes;
    bump();
    if (!nodes) return null;
    return nodes.subscribe(() => bump());
}

function bump(): void { rev++; for (const s of subs) s(); }

export function getNodesApi(): NodesApi | null { return api; }

// ── React 구독 창구(useSyncExternalStore) — rev 가 바뀌면 다시 읽는다 ──
export function subscribeTableNodes(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getTableRev(): number { return rev; }

/** 표 노드 하나(없으면 null). */
export function tableNodeOf(id: string | null): PublicNode | null {
    if (!api || !id) return null;
    const n = api.get(id);
    return n && n.type === TABLE_TYPE ? n : null;
}

/** 그 노드의 표 문서(없거나 비면 빈 표). */
export function docOf(id: string | null): TableDoc {
    const n = tableNodeOf(id);
    const d = n?.data as TableDoc | undefined;
    if (d && Array.isArray(d.cols) && Array.isArray(d.rows)) return d;
    return blankTable();
}

/** 문서를 통째로 쓴다(트랜잭션 적용 결과) — setData 는 타입 주인(table-editor)만 지난다. */
export function writeDoc(id: string, doc: TableDoc): void { api?.setData(id, doc); }

/** 조상에 휴지통이 있나 — 부모 사슬을 직접 탄다(달력·명단과 같은 규칙). */
export function inTrash(id: string): boolean {
    if (!api) return false;
    let cur: string | null = api.parent(id);
    let guard = 0;
    while (cur && guard < 1000) {
        if (cur === api.roots.trash) return true;
        if (cur === api.roots.main) return false;
        cur = api.parent(cur);
        guard++;
    }
    return false;
}

/** 살아 있는 표 노드 전부(트리 순서) — 시작 화면 목록. */
export function liveTables(): PublicNode[] {
    if (!api) return [];
    return api.byType(TABLE_TYPE).filter((n) => !inTrash(n.id));
}

/**
 * 시작 화면 「새 표」 — 탐색기 맨 위(main 루트)에 빈 표(3×3, 머리 행 켬)를 만든다. 이름 겹치면 「표 2」…
 *   data 에 blankTable 을 바로 심는다(탐색기 「새로 만들기」의 createInit 과 같은 결). 새 id 를 돌려준다(못 만들면 null).
 */
export function createTable(): string | null {
    if (!api) return null;
    const name = uniqueName('표', api.byType(TABLE_TYPE).map((n) => n.name));
    return api.create(api.roots.main, { type: TABLE_TYPE, name, data: blankTable() }) || null;
}

/** 노드가 든 폴더 이름(맨 위면 null) — 시작 화면 목록의 꼬리표. */
export function parentNameOf(id: string): string | null {
    if (!api) return null;
    const p = api.parent(id);
    if (!p || p === api.roots.main) return null;
    return api.get(p)?.name ?? null;
}
