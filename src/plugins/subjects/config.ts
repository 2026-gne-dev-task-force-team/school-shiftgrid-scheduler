/**
 * 과목 = 컬렉션 설정 한 장 — 목록 노드(subjects.list) + 줄 노드(subjects.subject) + 기본 칸 셋(이름·약칭·메모).
 *   🔴 특별실 칸은 관계 칸(방 목록을 가리킴)인데 **고르는 자리는 칸 설정**이다 — 비워 두어도 된다(학교 정보 교실 칸과 같은 꼴).
 *   ⛔ 시수 계산 같은 쓰임새는 없다(목록 관리만).
 */
import type { CollectionConfig, RecordField } from '../collection/contracts/collection';

export const LIST_TYPE = 'subjects.list';
export const SUBJECT_TYPE = 'subjects.subject';

/** 새 목록에 심는 칸 — 부를 때마다 새 객체(목록끼리 공유하지 않게). */
export const newListFields = (): RecordField[] => [
    {
        key: 'f_kind', label: '구분', type: 'select', locked: true,
        description: '담임이 가르치는 과목인지, 전담 교사가 가르치는 과목인지, 공통인지 가릅니다.',
        options: [
            { value: 'homeroom', label: '담임 과목', color: 'blue' },
            { value: 'subject', label: '전담 과목', color: 'green' },
            { value: 'common', label: '공통', color: 'gray' },
        ],
    },
    {
        key: 'f_color', label: '색', type: 'select',
        description: '시간표에서 이 과목을 알아보기 쉽게 하는 색입니다.',
        options: [
            { value: 'blue', label: '파랑', color: 'blue' },
            { value: 'green', label: '초록', color: 'green' },
            { value: 'orange', label: '주황', color: 'orange' },
            { value: 'purple', label: '보라', color: 'purple' },
            { value: 'gray', label: '회색', color: 'gray' },
        ],
    },
    {
        key: 'f_room', label: '특별실', type: 'relation', config: { many: true },
        description: '이 과목이 쓰는 특별실입니다. 칸 설정에서 방 목록을 고르면 그 목록의 방을 여럿 고를 수 있습니다.',
    },
];

export const SUBJECT_CONFIG: CollectionConfig = {
    listType: LIST_TYPE,
    itemType: SUBJECT_TYPE,
    viewId: 'subjects.sheet',
    openCommandId: 'subjects.openList',
    viewKey: 'subjects.list',
    listLabel: '과목 목록',
    listIcon: 'book',
    itemIcon: 'book',
    baseFields: [
        { key: 'name', label: '이름', type: 'text', locked: true, description: '과목 이름입니다(예: 국어). 탐색기 줄 이름과 같습니다.' },
        { key: 'short', label: '약칭', type: 'text', locked: true, description: '시간표 칸에 줄여 쓸 이름입니다(예: 국).' },
        { key: 'memo', label: '메모', type: 'text', locked: true, description: '이 과목에 대한 자유 메모입니다.' },
    ],
    newListFields,
    description: '학교에서 가르치는 과목을 적어 두는 목록입니다.',
    unit: '과목',
    text: { startDescription: '새로 만들거나, 만들어 둔 과목 목록을 고른다.', startHint: '빈 과목 목록이 바로 열린다' },
};
