/** 방 목록의 기본 칸 — 이름·메모. RecordField 로 선언해 표·인스펙터가 같은 정의를 읽는다(locked: 지우기·타입 바꾸기 금지). */
import type { RecordField } from '../collection/contracts/collection';

export const ROOM_BASE_FIELDS: RecordField[] = [
    { key: 'name', label: '이름', type: 'text', locked: true },
    { key: 'memo', label: '메모', type: 'text', locked: true },
];
