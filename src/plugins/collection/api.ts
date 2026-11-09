/**
 * collection 모듈 값 — host.modules 로 손님에게 가는 RecordViewApi 한 벌.
 *   RecordView 컴포넌트 · 칸 타입 레지스트리(내장 여섯 + 꽂힌 타입) · 순수 변환(schema).
 *   ⛔ 호출자별 팩토리 아님 — 목록 화면 부품은 누가 받아도 같다(자료·보기 정의는 손님이 쥔다).
 */
import type { RecordViewApi } from './contracts/collection';
import { RecordView } from './RecordView';
import { PropertyList } from './views/PropertyList';
import { planConvert } from './convert';
import { fieldTypes } from './fields/registry';
import { normalizeRelation, relationToText } from './schema';

export const recordViewApi: RecordViewApi = {
    version: 2,
    RecordView,
    PropertyList,
    fieldTypes,
    schema: { planConvert, normalizeRelation, relationToText },
};
