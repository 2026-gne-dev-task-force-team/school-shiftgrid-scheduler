/**
 * 보결 명단 ↔ 노드 시스템 다리 — rooms·people 과 같은 꼴(다리 본체는 컬렉션 바닥 defineCollection).
 *   다른 점 하나: 명단 노드의 createInit 이 「구분」 칸을 심는다(탐색기 「새로 만들기」 길 — 시작 화면 길은 config.newListFields 를 kit 가 쓴다).
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만 · collection 값은 host.modules.use('collection') 로(구조 검사 ⑨).
 */
import type { NodesApi, NodeTypeImplFns } from '../explorer/contracts/nodes';
import type { CollectionKit, RecordViewApi } from '../collection/contracts/collection';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { STAFF_CONFIG, LIST_TYPE, STAFF_TYPE, newListFields } from './config';

export { LIST_TYPE, STAFF_TYPE };

let kit: CollectionKit | null = null;
export function getKit(): CollectionKit | null { return kit; }
/** 테스트가 직접 건넬 수 있다(활성 없이). */
export function setKit(k: CollectionKit | null): void { kit = k; }

/** 활성(index.ts)이 한 번 — 컬렉션 모듈로 kit 를 만들고 NodesApi 를 잇는다(없으면 조용히 빈 상태). */
export function initSubstitute(host: PluginHost): Disposable | null {
    const rv = host.modules.use<RecordViewApi>('collection');
    const nodes = host.modules.use<NodesApi>('nodes');
    kit = rv ? rv.defineCollection(STAFF_CONFIG) : null;
    return kit?.init(nodes ?? null) ?? null;
}

export const substituteNodeTypeImpl = {
    list: {
        open: (host: PluginHost, id: string) => { kit?.open(host, id); },
        menu: (_host: PluginHost, id: string): MenuEntry[] => kit?.menu(id) ?? [],
        createInit: () => ({ data: { fields: newListFields() } }),
    } satisfies NodeTypeImplFns,
};

export const substituteNodeTypes: NodeTypeContribution<'list'>[] = [
    {
        type: LIST_TYPE, body: 'collection', label: '보결 명단', icon: 'users',
        container: { accepts: [STAFF_TYPE, 'folder', LIST_TYPE] }, openable: true,
        create: { label: '보결 명단', under: ['folder', LIST_TYPE] },
        impl: 'list',
    },
    { type: STAFF_TYPE, label: '교직원', icon: 'user', record: true },
];
