/**
 * 🔴 people 인터페이스 모듈 — manifest.provides.people 와 짝. host.modules.use<People>('people') 가 이걸 받는다.
 *   속은 컬렉션 kit(nodes.ts 가 쥔 것)로만 — 항목(칸 값) ↔ 약속의 Person(이름·메모) 변환만 여기서 한다.
 *   ⛔ 호출자별 팩토리 아님 — 명단·사람은 누가 봐도 같다(저장·휴지통 주인은 노드 시스템이 쥔다).
 */
import type { CollectionItem } from '../collection/contracts/collection';
import type { People, Person } from './contracts/people';
import type { Disposable } from '../../pane-ui-system/plugin';
import { getKit } from './nodes';

function toPerson(it: CollectionItem): Person {
    const p: Person = { id: it.id, listId: it.listId, name: it.name };
    if (typeof it.values.memo === 'string' && it.values.memo !== '') p.memo = it.values.memo;
    if (it.ext) p.ext = it.ext;
    return p;
}

export const peopleApi: People = {
    version: 1,
    lists: () => getKit()?.lists() ?? [],
    peopleIn: (listId) => getKit()?.itemsIn(listId).map(toPerson) ?? [],
    person: (id) => { const it = getKit()?.itemOf(id); return it ? toPerson(it) : undefined; },
    addPerson: (listId, input) => getKit()?.addItem(listId, { name: input.name, memo: input.memo ?? '' }) ?? '',
    updatePerson: (id, patch) => {
        const k = getKit();
        if (patch.name !== undefined) k?.setValue(id, 'name', patch.name);
        if (patch.memo !== undefined) k?.setValue(id, 'memo', patch.memo);
    },
    removePerson: (id) => getKit()?.removeItem(id),
    movePerson: (id, listId, index) => getKit()?.moveItem(id, listId, index),
    pastePeople: (listId, text) => getKit()?.pasteItems(listId, text) ?? [],
    onChange: (listener): Disposable => getKit()?.onChange(listener) ?? { dispose() { /* kit 없음 */ } },
};
