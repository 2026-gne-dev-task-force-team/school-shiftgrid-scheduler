/**
 * 복무 대장 = 컬렉션 설정 한 장 — 목록 노드(duty.ledger) + 그 안의 복무 노드(duty.entry).
 *   기본 칸(잠금)은 이름·메모 · 나머지는 새 대장에 심는 칸(newListFields — 잠금, 선택지·이름표는 고친다).
 *   🔴 종류 선택지 value 는 영어로 고정 — 이름(label)을 바꿔도 행 값은 그대로다(보결이 value 로 읽는다).
 */
import type { CollectionConfig, RecordField, FieldOption } from '../collection/contracts/collection';

export const LIST_TYPE = 'duty.ledger';
export const ENTRY_TYPE = 'duty.entry';

export const KIND_OPTIONS: FieldOption[] = [
    { value: 'trip', label: '출장', color: 'blue' },
    { value: 'training', label: '연수', color: 'purple' },
    { value: 'annual', label: '연가', color: 'green' },
    { value: 'sick', label: '병가', color: 'red' },
    { value: 'official', label: '공가', color: 'orange' },
    { value: 'special', label: '특별휴가', color: 'pink' },
    { value: 'early', label: '조퇴', color: 'yellow' },
    { value: 'out', label: '외출', color: 'yellow' },
    { value: 'late', label: '지참', color: 'gray' },
];

/** 새 대장에 심는 칸 — 부를 때마다 새 객체(대장끼리 공유하지 않게). 칸 순서: 이름 · 사람 · 종류 · 시작일 · 끝일 · 종일 · 교시 · 메모. */
export const newLedgerFields = (): RecordField[] => [
    { key: 'f_person', label: '사람', type: 'relation', locked: true, config: { many: false },
      description: '복무하는 사람입니다. 칸 설정에서 교직원 명단을 고르면 그 명단에서 고릅니다.' },
    { key: 'f_kind', label: '종류', type: 'select', locked: true, options: KIND_OPTIONS.map((o) => ({ ...o })),
      description: '출장·연수·연가 같은 복무 종류입니다.' },
    { key: 'f_start', label: '시작일', type: 'date', locked: true, description: '복무가 시작되는 날입니다.' },
    { key: 'f_end', label: '끝일', type: 'date', locked: true, description: '복무가 끝나는 날입니다. 비우면 시작일 하루입니다.' },
    { key: 'f_allday', label: '종일', type: 'check', locked: true, description: '체크하면 그 날 모든 교시에 자리를 비웁니다.' },
    { key: 'f_periods', label: '교시', type: 'text', locked: true, description: '자리를 비우는 교시입니다. 예: 3-4, 5, 1,3 (종일이면 무시).' },
];

export const DUTY_CONFIG: CollectionConfig = {
    listType: LIST_TYPE,
    itemType: ENTRY_TYPE,
    viewId: 'duty.sheet',
    openCommandId: 'duty.openLedger',
    viewKey: 'duty.ledger',
    listLabel: '복무 대장',
    listIcon: 'calendar',
    itemIcon: 'file',
    baseFields: [
        { key: 'name', label: '이름', type: 'text', locked: true, description: '이 복무를 가리키는 제목입니다. 예: 교육청 출장.' },
        { key: 'memo', label: '메모', type: 'text', locked: true, description: '이 복무에 대한 자유 메모입니다.' },
    ],
    newListFields: newLedgerFields,
    description: '교직원의 출장·연수·연가·병가 같은 복무를 적는 대장입니다. 보결이 「그 시간 누가 학교에 없나」를 여기서 읽습니다.',
    unit: '건',
    text: { startDescription: '새로 만들거나, 만들어 둔 복무 대장을 고른다.', startHint: '빈 복무 대장이 바로 열린다' },
};
