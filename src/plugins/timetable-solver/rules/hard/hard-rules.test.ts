/**
 * 하드 규칙 9 — 규칙마다 시험 하나(F2a 끝 판정).
 *   각 규칙: 어기는 합성 입력이면 위반이 나고, 지키는 입력이면 0. about(선생님 말)이 비어 있지 않다.
 *   입력은 지어낸 작은 학교(../__fixtures__/messy) — 실자료 없음.
 */
import { describe, expect, it } from 'vitest';
import { buildContext } from '../../engine/core';
import type { RuleContribution } from '../../contracts/rule';
import { HARD_RULES } from './index';
import { hardCase } from '../__fixtures__/messy';

const IDS = [
    'no-overlap-track', 'no-overlap-agent', 'no-overlap-resource', 'blocked-cell', 'demand-count',
    'block-contiguous', 'cycle-order', 'agent-lunch-free', 'homeroom-plus-free',
];

const run = (rule: RuleContribution, variant: 'bad' | 'ok') => {
    const c = hardCase(rule.id, variant);
    return rule.evaluate(c.params ?? {}, buildContext(c.doc));
};

describe('하드 규칙 낱개 기여', () => {
    it('하드 9가 v1 순서대로 다 있고 모두 hard', () => {
        expect(HARD_RULES.map((r) => r.id)).toEqual(IDS);
        expect(HARD_RULES.every((r) => r.kind === 'hard')).toBe(true);
    });
    for (const rule of HARD_RULES) {
        it(`${rule.id} — ${rule.about}`, () => {
            expect(rule.about.length).toBeGreaterThan(0);
            const bad = run(rule, 'bad');
            expect(bad.length, '어기는 입력에서 위반이 나야 한다').toBeGreaterThan(0);
            expect(bad.every((v) => v.templateId === rule.id && v.kind === 'hard' && v.weight === 0)).toBe(true);
            expect(run(rule, 'ok'), '지키는 입력에서는 위반 0').toEqual([]);
        });
    }
});
