/**
 * 일과표 = 컬렉션 설정 한 장 — 목록 노드(bell.table) + 그 안의 시간 칸 노드(bell.slot).
 *   기본 칸(잠금)은 이름·메모 · 구분·교시·시작·끝·학년은 새 일과표에 심는 칸(잠금 — 셈이 읽는다).
 *   🔴 select 선택지 value 는 영어 고정(clock.ts 가 value 로 읽는다). 시각은 text 'HH:MM' — 검증은 clock.ts checkRows.
 */
import type { CollectionConfig, RecordField } from '../collection/contracts/collection';
import { SLOT_KEYS } from './clock';

export const LIST_TYPE = 'bell.table';
export const SLOT_TYPE = 'bell.slot';

export const newListFields = (): RecordField[] => [
    {
        key: SLOT_KEYS.kind, label: '구분', type: 'select', locked: true,
        description: '이 칸이 무엇인지 가릅니다. 수업 칸만 교시 번호를 가집니다.',
        options: [
            { value: 'class', label: '수업', color: 'blue' },
            { value: 'break', label: '쉬는 시간', color: 'gray' },
            { value: 'lunch', label: '점심', color: 'orange' },
            { value: 'assembly', label: '조회·조례', color: 'green' },
            { value: 'dismissal', label: '하교', color: 'red' },
        ],
    },
    { key: SLOT_KEYS.period, label: '교시', type: 'number', locked: true, description: '수업 칸만 — 그 학년 안에서의 교시 번호입니다(점심 뒤 교시도 이어서 셉니다).' },
    { key: SLOT_KEYS.start, label: '시작', type: 'text', locked: true, description: '시작 시각 — 09:00 꼴로 적습니다.' },
    { key: SLOT_KEYS.end, label: '끝', type: 'text', locked: true, description: '끝 시각 — 09:40 꼴로 적습니다. 하교는 비워도 됩니다.' },
    {
        key: SLOT_KEYS.grades, label: '학년', type: 'multi', locked: true,
        description: '이 칸이 해당하는 학년입니다. 비우면 전 학년입니다.',
        options: ['1', '2', '3', '4', '5', '6'].map((g) => ({ value: g, label: `${g}학년`, color: 'gray' })),
    },
];

export const SLOT_CONFIG: CollectionConfig = {
    listType: LIST_TYPE,
    itemType: SLOT_TYPE,
    viewId: 'bell.sheet',
    openCommandId: 'bell.openList',
    viewKey: 'bell.table',
    listLabel: '일과표',
    listIcon: 'schedule',
    itemIcon: 'schedule',
    baseFields: [
        { key: 'name', label: '이름', type: 'text', locked: true, description: '이 칸의 이름입니다(예: 1교시, 점심). 탐색기 줄 이름과 같습니다.' },
        { key: 'memo', label: '메모', type: 'text', locked: true, description: '이 칸에 대한 자유 메모입니다.' },
    ],
    newListFields,
    description: '학교의 교시별 시작·끝 시각, 점심, 하교를 적는 일과표입니다. 학년마다 점심이 다르면 학년 칸으로 갈라 적습니다.',
    unit: '줄',
    text: { startDescription: '새로 만들거나, 만들어 둔 일과표를 고른다.', startHint: '구분·교시·시작·끝·학년 칸이 든 빈 일과표가 바로 열린다' },
};
