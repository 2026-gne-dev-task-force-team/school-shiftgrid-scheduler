/**
 * 마감 판정 — 판정 본체는 서버와 함께 쓰려고 `shared/ops-aux/month-lock.ts` 로 옮겼다(T-10e2). 여기는 앱 쪽 이름 그대로 다시 내보낸다.
 */
export { judgeAuxChange, type AuxJudgment, type MonthState } from '../../../../shared/ops-aux/month-lock.ts';
