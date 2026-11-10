/**
 * 보결 명단 = 컬렉션 설정 한 장 — 목록 노드(substitute.list) + 그 안의 교직원 노드(substitute.staff).
 *   기본 칸(잠금)은 이름·메모 · 「구분」은 새 명단에 심는 **사용자 칸**이라 선택지를 고치고 더할 수 있다(쥔님 2026-11-10 「기본 목록 만들어 놓고 수정 가능하게」).
 *   🔴 선택지 value 는 영어로 고정 — 이름(label)을 바꿔도 행 값은 그대로라, 나중에 후보 등급이 value 로 읽는다.
 */
import type { CollectionConfig, RecordField } from '../collection/contracts/collection';

export const LIST_TYPE = 'substitute.list';
export const STAFF_TYPE = 'substitute.staff';

/** 새 명단에 심는 칸 — 부를 때마다 새 객체(명단끼리 공유하지 않게). */
export const newListFields = (): RecordField[] => [{
    key: 'f_kind', label: '구분', type: 'select',
    description: '보결 후보를 가르는 구분입니다. 선택지는 이 명단 안에서 고치거나 더할 수 있습니다.',
    options: [
        { value: 'homeroom', label: '담임', color: 'blue' },
        { value: 'subject', label: '전담', color: 'green' },
        { value: 'nonteaching', label: '비교과', color: 'orange' },
        { value: 'assistant', label: '보조인력', color: 'gray' },
    ],
}];

export const STAFF_CONFIG: CollectionConfig = {
    listType: LIST_TYPE,
    itemType: STAFF_TYPE,
    // 🔴 viewId 접두사 = 플러그인 id(host 가 'substitute.' 를 붙인다).
    viewId: 'substitute.sheet',
    openCommandId: 'substitute.openList',
    viewKey: 'substitute.list',
    listLabel: '보결 명단',
    listIcon: 'users',
    baseFields: [
        { key: 'name', label: '이름', type: 'text', locked: true, description: '명단에서 이 사람을 가리키는 이름입니다. 탐색기 줄 이름과 같습니다.' },
        { key: 'memo', label: '메모', type: 'text', locked: true, description: '이 사람에 대한 자유 메모입니다.' },
    ],
    newListFields,
    unit: '명',
    text: { startDescription: '새로 만들거나, 만들어 둔 보결 명단을 고른다.', startHint: '구분 칸이 든 빈 명단이 바로 열린다' },
};
