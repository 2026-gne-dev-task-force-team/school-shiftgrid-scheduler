/**
 * 보결 줄 저장 — 🔴 줄 하나가 노드 하나(`ops-sub.slot`, 값 = 줄 그대로)다. 줄들은 「보결 판」 노드(`ops-sub.board`) 밑에 산다.
 *   ⛔ NodesApi 하나로만. 약속(`contracts/sub.ts`)의 제공자 몸통이다 — 노드가 없으면(꺼짐) 빈 목록 · 쓰기는 충돌로 돌려준다.
 */
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Disposable, NodeTypeContribution } from '../../pane-ui-system/plugin';
import type { Sub, SubSlotRow } from './contracts/sub';

export const BOARD_TYPE = 'ops-sub.board';
export const SLOT_TYPE = 'ops-sub.slot';

export const subNodeTypes: NodeTypeContribution<never>[] = [
    { type: BOARD_TYPE, label: '보결 판', icon: 'list', container: { accepts: [SLOT_TYPE] } },
    { type: SLOT_TYPE, label: '보결 줄', icon: 'list', record: true },
];

let nodesApi: NodesApi | null = null;
/** 활성(index.ts)이 노드 다리를 건넨다 — 테스트도 직접 건넨다. */
export function setNodes(n: NodesApi | null): void { nodesApi = n; }
export const getNodes = (): NodesApi | null => nodesApi;

const rowOf = (n: { data?: unknown }): SubSlotRow | null => {
    const d = n.data as SubSlotRow | undefined;
    return d && typeof d.id === 'string' && typeof d.date === 'string' ? d : null;
};
const clone = (r: SubSlotRow): SubSlotRow => JSON.parse(JSON.stringify(r)) as SubSlotRow;
const sameKey = (a: SubSlotRow, b: SubSlotRow) =>
    a.projectId === b.projectId && a.date === b.date && a.trackName === b.trackName && a.startMin === b.startMin;

/** 살아 있는 줄 노드 — [노드 id, 줄]. */
function live(nodes: NodesApi): { nodeId: string; row: SubSlotRow }[] {
    const out: { nodeId: string; row: SubSlotRow }[] = [];
    for (const n of nodes.liveByType(SLOT_TYPE)) { const row = rowOf(n); if (row) out.push({ nodeId: n.id, row }); }
    return out;
}
const boardId = (nodes: NodesApi): string => nodes.liveByType(BOARD_TYPE)[0]?.id || nodes.create(nodes.roots.main, { type: BOARD_TYPE, name: '보결 판' });
const slotName = (r: SubSlotRow) => `${r.date} ${r.trackName}`;

/** 줄 하나를 노드로 더한다 — 판이 없으면 만든다. 못 만들면 false. */
export function addSlotNode(nodes: NodesApi, row: SubSlotRow): boolean {
    const b = boardId(nodes);
    return !!b && !!nodes.create(b, { type: SLOT_TYPE, name: slotName(row), data: clone(row) });
}

/** 약속 「sub」 제공자 — 노드 다리는 부를 때마다 읽는다(활성 전엔 비어 있다). */
export const subApi: Sub = {
    version: 1,
    slotsOn: (date) => { const n = nodesApi; return n ? live(n).filter((x) => x.row.date === date).map((x) => clone(x.row)) : []; },
    slot: (id) => { const n = nodesApi; const f = n ? live(n).find((x) => x.row.id === id) : undefined; return f ? clone(f.row) : undefined; },
    save(row, opts = {}) {
        const n = nodesApi;
        if (!n) return { ok: false, conflict: true };
        const all = live(n);
        const old = all.find((x) => sameKey(x.row, row));
        const { ifMatch } = opts;
        if (ifMatch !== undefined && (ifMatch === null ? !!old : !old || old.row.updatedAt !== ifMatch)) return { ok: false, conflict: true };
        let ok = true;
        n.batch(() => { if (old) n.remove(old.nodeId); ok = addSlotNode(n, row); });
        return ok ? { ok: true, row: clone(row) } : { ok: false, conflict: true };
    },
    remove(row, opts = {}) {
        const n = nodesApi;
        const f = n ? live(n).find((x) => x.row.id === row.id && x.row.projectId === row.projectId) : undefined;
        if (!n || !f || (opts.ifMatch !== undefined && f.row.updatedAt !== opts.ifMatch)) return { ok: false, conflict: true };
        n.remove(f.nodeId);
        return { ok: true };
    },
    onChange(listener): Disposable {
        const s = nodesApi?.subscribe(() => listener());
        return { dispose: () => { s?.dispose(); } };
    },
};
