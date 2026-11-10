/**
 * 학교 정보 설정 — 학교 노드(싱글톤) · 학년도 = 컬렉션 설정 한 장(목록 school.year + 줄 school.class = 반).
 *   🔴 교실 칸은 관계 칸(kind:'db' 방 목록)인데 **고르는 자리는 칸 설정**이다 — 비워 두어도 된다(방 목록 플러그인은 모른다).
 */
import type { CollectionConfig, RecordField, FieldOption } from '../collection/contracts/collection';

export const SCHOOL_TYPE = 'school.school';
export const YEAR_TYPE = 'school.year';
export const CLASS_TYPE = 'school.class';
export const SCHOOL_VIEW = 'school.editor';

export const LEVEL_OPTIONS: FieldOption[] = [
    { value: 'elementary', label: '초등학교', color: 'green' },
    { value: 'middle', label: '중학교', color: 'blue' },
    { value: 'high', label: '고등학교', color: 'purple' },
    { value: 'special', label: '특수학교', color: 'orange' },
];

/** 학교 칸 — 이름은 노드 이름(제목)이다. */
export const SCHOOL_FIELDS: RecordField[] = [
    { key: 'name', label: '이름', type: 'text', locked: true, description: '학교 이름입니다. 탐색기 줄 이름과 같습니다.' },
    { key: 'level', label: '학교급', type: 'select', options: LEVEL_OPTIONS, description: '초·중·고·특수 중 하나입니다.' },
    { key: 'memo', label: '메모', type: 'text', description: '학교에 대한 자유 메모입니다.' },
];

/** 새 학년도에 심는 사용자 칸 — 교실(방 목록을 가리키는 관계 칸, 여러 개). 칸 설정에서 방 목록을 고른다. */
export const newYearFields = (): RecordField[] => [{
    key: 'f_room', label: '교실', type: 'relation', config: { many: true },
    description: '이 반이 쓰는 교실입니다. 칸 설정에서 방 목록을 고르면 그 목록의 방을 여럿 고를 수 있습니다.',
}];

export const CLASS_CONFIG: CollectionConfig = {
    listType: YEAR_TYPE,
    itemType: CLASS_TYPE,
    viewId: 'school.sheet',
    openCommandId: 'school.openYear',
    viewKey: 'school.year',
    listLabel: '학년도',
    listIcon: 'calendar',
    baseFields: [
        { key: 'name', label: '이름', type: 'text', locked: true, description: '반 이름입니다(예: 3-2). 탐색기 줄 이름과 같습니다.' },
        { key: 'grade', label: '학년', type: 'number', locked: true, description: '학년 숫자입니다.' },
        { key: 'no', label: '반', type: 'number', locked: true, description: '반 숫자입니다.' },
        { key: 'special', label: '도움반', type: 'check', locked: true, description: '도움반(특수학급)이면 체크합니다.' },
        { key: 'memo', label: '메모', type: 'text', locked: true, description: '이 반에 대한 자유 메모입니다.' },
    ],
    newListFields: newYearFields,
    unit: '반',
    text: { startDescription: '새로 만들거나, 만들어 둔 학년도를 고르세요.', startHint: '교실 칸이 든 빈 학년도가 바로 열립니다' },
};
