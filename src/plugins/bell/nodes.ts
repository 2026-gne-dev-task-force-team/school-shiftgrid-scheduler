/**
 * 일과표 ↔ 노드 시스템 다리 — 🔴 일과표도 시간 칸도 노드다. 저장·휴지통·복원은 노드 시스템이 한다(달력과 같은 규칙).
 *   ⭐ P4a: 다리 본체(읽기·쓰기·붙여 넣기·화면)는 컬렉션 바닥의 defineCollection 이 한 벌로 낸다 — 이 파일은
 *     ① 노드 타입 둘을 contributes 로 적고(정적 데이터) ② 활성 때 kit 를 만들어 쥐고 ③ 노드 타입 함수(open·menu)를 kit 로 잇는다.
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 *   🔴 collection 꾸러미의 값은 import 못 한다(구조 검사 ⑨) — defineCollection 은 host.modules.use('collection') 로 받는다.
 */
// 🔴 import type 만 — 약속 타입은 약속 플러그인에서(값 아님, 구조 검사 ⑱·d·g).
import type { NodesApi, NodeTypeImplFns } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { CollectionKit, RecordViewApi } from '../collection/contracts/collection';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { SLOT_CONFIG, LIST_TYPE, SLOT_TYPE, newListFields } from './config';

export { LIST_TYPE, SLOT_TYPE };

// ── kit — 활성 때 만든다(꾸러미 사이 값 import 금지라 모듈로 받는다). 뷰·명령은 부를 때마다 읽는다. ──
let kit: CollectionKit | null = null;
export function getKit(): CollectionKit | null { return kit; }
/** 테스트가 직접 건넬 수 있다(활성 없이). */
export function setKit(k: CollectionKit | null): void { kit = k; }

/** 활성(index.ts)이 한 번 — 컬렉션 모듈로 kit 를 만들고 NodesApi 를 잇는다(없으면 조용히 빈 상태). */
export function initBell(host: PluginHost): Disposable | null {
    const rv = host.modules.use<RecordViewApi>('collection');
    const nodes = host.modules.use<NodesApi>('nodes');
    kit = rv ? rv.defineCollection(SLOT_CONFIG) : null;
    return kit?.init(nodes ?? null) ?? null;
}

/**
 * 🔴 노드 타입 함수 묶음(선언형 D5) — contributes.nodeTypes 의 impl 이름('list')이 가리킨다.
 *   · open — 일과표를 열면 「보고 있는 일과표」을 그걸로 두고 일과표 화면을 가운데에.
 *   · menu — 일과표 우클릭 「일과표 열기」(host 는 안 쓴다).
 *   시간 칸(record)은 순수 데이터라 impl 이 없다.
 */
export const bellNodeTypeImpl = {
    list: {
        open: (host: PluginHost, id: string) => { kit?.open(host, id); },
        menu: (_host: PluginHost, id: string): MenuEntry[] => kit?.menu(id) ?? [],
        createInit: () => ({ data: { fields: newListFields() } }),
    } satisfies NodeTypeImplFns,
};

/**
 * 타입 둘을 contributes.nodeTypes 로 적는다 — 🔴 record 리터럴은 여기(비-뷰)에 산다(구조 검사 ⑯: 뷰엔 소문자 record 금지).
 *   일과표: 컨테이너(일과표·폴더·시간 칸을 받음 — 일과표 안에 일과표 가능)·열 수 있음·우클릭 「새로 만들기」 후보 · 함수는 impl 'list'.
 *   시간 칸: record: true — 탐색기에 어떤 경우에도 안 보인다(저장·휴지통은 일반 노드와 같다).
 */
export const bellNodeTypes: NodeTypeContribution<'list'>[] = [
    {
        type: LIST_TYPE, body: 'collection', label: '일과표', icon: 'schedule',
        container: { accepts: [SLOT_TYPE, 'folder', LIST_TYPE] }, openable: true,
        create: { label: '일과표', under: ['folder', LIST_TYPE] },
        impl: 'list',
    },
    { type: SLOT_TYPE, label: '시간 칸', icon: 'schedule', record: true },
];
