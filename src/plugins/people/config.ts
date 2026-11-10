/**
 * 명단 = 컬렉션 설정 한 장 — 목록 노드(people.list) + 그 안의 사람 노드(people.person) + 기본 칸 둘(이름·메모).
 *   다리·화면·속성 패널·붙여 넣기는 컬렉션 바닥(collection 꾸러미 defineCollection)이 한 벌로 낸다 — 이 꾸러미는 이 설정만 쥔다.
 *   ⛔ 뽑기·조 나누기 같은 쓰임새는 없다(요구명세: *"기능은 아직 없다. 명단만 관리"*).
 */
import type { CollectionConfig } from '../collection/contracts/collection';

export const LIST_TYPE = 'people.list';
export const PERSON_TYPE = 'people.person';

export const PERSON_CONFIG: CollectionConfig = {
    listType: LIST_TYPE,
    itemType: PERSON_TYPE,
    // 🔴 viewId 접두사 = 플러그인 id(host 가 'people.' 를 붙인다). 명단을 열면 여는 명단 화면.
    viewId: 'people.sheet',
    openCommandId: 'people.openList',
    viewKey: 'people.list',
    listLabel: '사람 명단',
    listIcon: 'users',
    itemIcon: 'user',
    // 기본 칸 — 지우기·타입 바꾸기 금지(locked). 첫 칸이 제목(노드 이름).
    baseFields: [
        { key: 'name', label: '이름', type: 'text', locked: true, description: '명단에서 이 사람을 가리키는 이름입니다. 탐색기 줄 이름과 같습니다.' },
        { key: 'memo', label: '메모', type: 'text', locked: true, description: '이 사람에 대한 자유 메모입니다.' },
    ],
    description: '학교 사람들을 모아 두는 명단입니다. 시간표·보결·근무에서 사람을 고를 때 여기서 고릅니다.',
    unit: '명',
    text: { startDescription: '새로 만들거나, 만들어 둔 명단을 고른다.', startHint: '빈 명단이 바로 열린다' },
};
