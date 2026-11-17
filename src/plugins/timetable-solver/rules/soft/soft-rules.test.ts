/**
 * 소프트 규칙 14 — 규칙마다 시험 하나(F2b 끝 판정).
 *   각 규칙: 어기는 합성 입력이면 벌점(weight > 0)이 붙고, 지키는 입력이면 위반 0. about(선생님 말)이 비어 있지 않다.
 *   입력은 지어낸 작은 학교(../__fixtures__/soft) — 실자료 없음.
 */
import { describe, expect, it } from 'vitest';
import { buildContext } from '../../engine/core';
import type { RuleContribution } from '../../contracts/rule';
import { SOFT_RULES } from './index';
import { softCase } from '../__fixtures__/soft';

const IDS = [
    'avoid', 'consecutive-limit', 'prefer-consecutive', 'compact-day',
    'subjects-per-day-agent', 'subjects-per-day-track', 'am-pm-balance', 'same-period-across-days',
    'subject-adjacent', 'day-cluster', 'one-place-per-day', 'lunch-adjacent',
    'day-load-balance', 'priority-early',
];

const run = (rule: RuleContribution, variant: 'bad' | 'ok') => {
    const c = softCase(rule.id, variant);
    return rule.evaluate(c.params ?? {}, buildContext(c.doc));
};

describe('소프트 규칙 낱개 기여', () => {
    it('소프트 14가 v1 순서대로 다 있고 모두 soft', () => {
        expect(SOFT_RULES.map((r) => r.id)).toEqual(IDS);
        expect(SOFT_RULES.every((r) => r.kind === 'soft')).toBe(true);
    });
    for (const rule of SOFT_RULES) {
        it(`${rule.id} — ${rule.about}`, () => {
            expect(rule.about.length).toBeGreaterThan(0);
            const bad = run(rule, 'bad');
            expect(bad.length, '어기는 입력에서 벌점이 붙어야 한다').toBeGreaterThan(0);
            expect(bad.every((v) => v.templateId === rule.id && v.kind === 'soft' && v.weight > 0)).toBe(true);
            expect(run(rule, 'ok'), '지키는 입력에서는 위반 0').toEqual([]);
        });
    }
});
