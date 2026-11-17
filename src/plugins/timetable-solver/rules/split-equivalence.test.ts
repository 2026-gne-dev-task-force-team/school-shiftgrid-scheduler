/**
 * 🔴 규칙 낱개화(F2a) 전후 동등 — 알고리즘 변경 0 을 시험으로 고정한다.
 *   스냅숏은 쪼개기 **전** 코드(engine/rules.ts 한 파일)로 떴다. 쪼갠 뒤 같은 합성 입력에서 같은 값이 나와야 통과.
 *   보는 것: 규칙 목록 순서·기본 규칙 · evaluateAll · diagnose · candidateCells(옮기기 판정이 규칙을 부른다).
 */
import { describe, expect, it } from 'vitest';
import { RULES, defaultRules, evaluateAll, diagnose, candidateCells } from '../engine/core';
import { messyDoc } from './__fixtures__/messy';

describe('규칙 낱개화 전후 같은 결과', () => {
    it('규칙 목록 순서·꼴이 같다', () => {
        expect(RULES.map((r) => [r.id, r.kind, r.label, r.description, r.defaultMessage, r.params, r.bucket ?? null])).toMatchSnapshot();
        expect(defaultRules()).toMatchSnapshot();
    });
    it('하드 9를 모두 어기는 입력 — evaluateAll 이 같다', () => {
        const v = evaluateAll(messyDoc());
        expect(new Set(v.filter((x) => x.kind === 'hard').map((x) => x.templateId)).size).toBe(9);
        expect(v).toMatchSnapshot();
    });
    it('diagnose 가 같다', () => {
        expect(diagnose(messyDoc())).toMatchSnapshot();
    });
    it('candidateCells 가 같다', () => {
        const doc = messyDoc();
        expect(candidateCells(doc, doc.assignments[0].id)).toMatchSnapshot();
    });
});
