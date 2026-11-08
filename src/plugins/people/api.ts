/**
 * 🔴 people 인터페이스 모듈 — manifest.provides.people 와 짝. host.modules.use<People>('people') 가 이걸 받는다.
 *   속은 노드 다리(nodes.ts)로만 — 다리가 쥔 NodesApi 를 읽고 쓴다(값은 모듈 전역이라 호출 시점에 산다).
 *   ⛔ 호출자별 팩토리 아님 — 명단·사람은 누가 봐도 같다(저장·휴지통 주인은 노드 시스템이 쥔다).
 */
import type { People } from './contracts/people';
import type { Disposable } from '../../pane-ui-system/plugin';
import {
    listsOf, peopleIn, personOf, addPerson, updatePerson, removePerson, movePerson, pastePeople, onNodesChange,
} from './nodes';

export const peopleApi: People = {
    version: 1,
    lists: () => listsOf(),
    peopleIn: (listId) => peopleIn(listId),
    person: (id) => personOf(id),
    addPerson: (listId, input) => addPerson(listId, input),
    updatePerson: (id, patch) => updatePerson(id, patch),
    removePerson: (id) => removePerson(id),
    movePerson: (id, listId, index) => movePerson(id, listId, index),
    pastePeople: (listId, text) => pastePeople(listId, text),
    onChange: (listener): Disposable => onNodesChange(listener),
};
