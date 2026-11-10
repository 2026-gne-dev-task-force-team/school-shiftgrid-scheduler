/**
 * 과목 ↔ 노드 시스템 다리 — 목록도 과목도 노드다. 저장·휴지통·복원은 노드 시스템이 한다(people 과 같은 꼴).
 *   다리 본체는 컬렉션 바닥(defineCollection)이 낸다 — 이 파일은 노드 타입 적기 · kit 쥐기 · 타입 함수(open·menu) 잇기.
 *   ⛔ host.store·persist·tree 를 직접 안 본다. 🔴 collection 값은 import 못 한다(구조 검사 ⑨) — host.modules.use('collection').
 */
import type { NodesApi, NodeTypeImplFns } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { CollectionKit, RecordViewApi } from '../collection/contracts/collection';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { SUBJECT_CONFIG, LIST_TYPE, SUBJECT_TYPE } from './config';

export { LIST_TYPE, SUBJECT_TYPE };

let kit: CollectionKit | null = null;
export function getKit(): CollectionKit | null { return kit; }
/** 테스트가 직접 건넬 수 있다(활성 없이). */
export function setKit(k: CollectionKit | null): void { kit = k; }

/** 활성(index.ts)이 한 번 — 컬렉션 모듈로 kit 를 만들고 NodesApi 를 잇는다(없으면 조용히 빈 상태). */
export function initSubjects(host: PluginHost): Disposable | null {
    const rv = host.modules.use<RecordViewApi>('collection');
    const nodes = host.modules.use<NodesApi>('nodes');
    kit = rv ? rv.defineCollection(SUBJECT_CONFIG) : null;
    return kit?.init(nodes ?? null) ?? null;
}

/** 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 이름('list')이 가리킨다. 과목(record)은 순수 데이터라 없다. */
export const subjectsNodeTypeImpl = {
    list: {
        open: (host: PluginHost, id: string) => { kit?.open(host, id); },
        menu: (_host: PluginHost, id: string): MenuEntry[] => kit?.menu(id) ?? [],
    } satisfies NodeTypeImplFns,
};

/** 타입 둘 — 🔴 record 리터럴은 비-뷰인 여기에 산다(구조 검사 ⑯). 과목은 record: true 라 탐색기에 안 보인다. */
export const subjectsNodeTypes: NodeTypeContribution<'list'>[] = [
    {
        type: LIST_TYPE, body: 'collection', label: '과목 목록', icon: 'book',
        container: { accepts: [SUBJECT_TYPE, 'folder', LIST_TYPE] }, openable: true,
        create: { label: '과목 목록', under: ['folder', LIST_TYPE] },
        impl: 'list',
    },
    { type: SUBJECT_TYPE, label: '과목', icon: 'book', record: true },
];
