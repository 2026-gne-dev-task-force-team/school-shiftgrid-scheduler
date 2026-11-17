/**
 * 보결 명단 ↔ 노드 시스템 — 🔴 R4(T-10ey): 사람 값은 교직원 명단(staff)으로 이사했다. 여기엔 옛 노드 타입 둘만 남는다.
 *   · 옛 노드(substitute.list·substitute.staff)는 지우지 않는다 — 이사한 것은 data.movedTo 표시가 붙고 탐색기에서 숨는다(되돌릴 수 있게).
 *   · 새로 만들기 길은 닫았다(create 없음) — 새 명단은 교직원 명단에서 만든다. 옛 컬렉션 kit(자기 저장)는 걷었다.
 *   · 이사(migrate.ts)는 활성 때 + 노드가 바뀔 때마다 돈다 — 멱등이라 다시 돌아도 같다. staff 가 아직 안 켜졌으면 0.
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만.
 */
import type { NodesApi, NodeTypeImplFns } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Disposable, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { OLD_LIST_TYPE, OLD_ITEM_TYPE, migrateSubstituteToStaff, movedTo } from './migrate';

export const LIST_TYPE = OLD_LIST_TYPE;
export const STAFF_TYPE = OLD_ITEM_TYPE;

let nodesApi: NodesApi | null = null;
/** staff 약속이 켜져 있나 — 꺼져 있으면 새 노드 타입이 없어 이사를 미룬다. */
let staffUp: () => boolean = () => false;
/** 테스트가 직접 건넬 수 있다(활성 없이). */
export function setNodes(n: NodesApi | null, up: () => boolean = () => true): void { nodesApi = n; staffUp = up; }

/** 지금 이사를 한 번 돌린다(멱등). 보기가 열릴 때도 부른다 — staff 가 나중에 켜져도 따라잡는다. */
export function runMigration(): number { return nodesApi ? migrateSubstituteToStaff(nodesApi, staffUp) : 0; }

/** 활성(index.ts)이 한 번 — 노드 다리를 쥐고 이사를 돌린다. 노드가 바뀔 때마다 다시 확인(멱등 · 새로 이사할 게 없으면 아무것도 안 쓴다). */
export function initSubstitute(host: PluginHost): Disposable | null {
    const nodes = host.modules.use<NodesApi>('nodes');
    nodesApi = nodes ?? null;
    staffUp = () => host.modules.use('staff') !== null;
    if (!nodes) return null;
    runMigration();
    const sub = nodes.subscribe(() => { runMigration(); });
    return { dispose: () => { sub.dispose(); nodesApi = null; } };
}

export const substituteNodeTypeImpl = {
    list: {
        // 옛 명단을 열면 보기(교직원 위)가 열린다 — 이사한 명단은 숨겨져 있어 보통 누를 일이 없다.
        open: (host: PluginHost) => { host.workspace.open('substitute.sheet', { where: 'center' }); },
        hidden: (id: string) => !!nodesApi && !!movedTo(nodesApi, id),
    } satisfies NodeTypeImplFns,
};

export const substituteNodeTypes: NodeTypeContribution<'list'>[] = [
    {
        type: LIST_TYPE, label: '보결 명단(옛)', icon: 'userSwap',
        container: { accepts: [STAFF_TYPE, 'folder', LIST_TYPE] }, openable: true,
        impl: 'list',
    },
    { type: STAFF_TYPE, label: '교직원(옛)', icon: 'user', record: true },
];
