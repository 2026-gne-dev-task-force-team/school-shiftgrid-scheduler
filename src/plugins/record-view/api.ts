/**
 * record-view 모듈 값 — host.modules 로 손님에게 가는 RecordViewApi 한 벌. 지금은 RecordView 컴포넌트 하나.
 *   ⛔ 호출자별 팩토리 아님 — 목록 화면 부품은 누가 받아도 같다(자료·보기 상태는 손님이 쥔다).
 */
import type { RecordViewApi } from './contracts/record-view';
import { RecordView } from './RecordView';

export const recordViewApi: RecordViewApi = {
    version: 1,
    RecordView,
};
