/**
 * 🔴 약속 「편성 규칙 기여」 — 규칙 하나 = 기여 하나(1.2v 편성기 분해 설계 2절 4번 · F2a).
 *   ⛔ 값(const·function) 0 — 낱개 실체는 ../rules/hard/*.ts(하드) · ../rules/soft/*.ts(소프트)에 산다.
 *   about 은 선생님 말 한 줄(「한 선생님이 같은 시간에 두 반에 들어가지 않게」). 화면의 규칙 목록·설명이 쓴다.
 */
import type { EngineRule } from '../engine/api';

/** 규칙 기여 하나 — v1 규칙 틀(EngineRule)에 선생님 말 about 을 붙인 꼴. */
export type RuleContribution = EngineRule & {
    /** 선생님 말 한 줄 — 무엇을 지키게 하나 */
    readonly about: string;
};
