/**
 * 규칙 등록표 — 하드 9 · 소프트 14.
 * 각 규칙은 ctx(EngineContext) 하나만 보고 위반 목록을 돌려준다.
 * 소프트 벌점 weight = 건수(magnitude) × bucketWeight × tierWeight(해당 교사).
 *   ⭐ F2a·F2b: 규칙 23과 공용 도구는 낱개 기여로 나갔다 — ../rules/hard/*.ts · ../rules/soft/*.ts · ../rules/kit.ts
 *     (글자 그대로 옮김). 🔴 등록 순서는 v1 과 같다 — ../rules/split-equivalence.test.ts.
 */
import type { ConflictRule, RuleParams } from '../types/schema';
import type { EngineRule } from './api';
import { DAYS } from '../rules/kit';
import { HARD_RULES } from '../rules/hard';
import { SOFT_RULES } from '../rules/soft';

export const RULES: EngineRule[] = [
    // 하드 9 — 낱개 기여(../rules/hard)
    ...HARD_RULES,
    // 소프트 14 — 낱개 기여(../rules/soft)
    ...SOFT_RULES,
];

export function defaultRules(): ConflictRule[] {
    return RULES.map((t) => ({
        id: `rule-${t.id}`,
        templateId: t.id,
        name: t.label,
        enabled: t.id !== 'one-place-per-day',
        params: Object.fromEntries(t.params.map((p) => [p.key, p.default])) as RuleParams,
    }));
}

export const DAY_NAMES = DAYS;
