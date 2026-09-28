/**
 * checkCapacity — 자동 배정을 돌리기 전에 「구조적으로 못 푸는 시수표」를 잡는다 (v3).
 *  ⚠️ 계약 스텁 — 엔진 판이 채운다. 빈 배열 = 「문제 없음」이라 화면은 이 상태로도 돈다.
 */
import type { Doc } from '../types/doc';
import type { CapacityIssue } from './api';

export function checkCapacity(_doc: Doc): CapacityIssue[] {
    return [];
}
