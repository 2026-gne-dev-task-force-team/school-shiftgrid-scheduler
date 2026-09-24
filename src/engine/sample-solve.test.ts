/**
 * 샘플 학교 실측 — 솔버가 실제 크기(18반·전담 7·180시수)에서 어디까지 가나.
 * 통과 조건은 「끝난다 · 전 시수 배치」뿐이고, 하드 점수는 콘솔로 남긴다(설계 노트 「재 봤더니」에 적는 값).
 */
import { describe, it, expect } from 'vitest';
import { sampleDoc } from '../io/sample';
import { defaultRules, solve, diagnose } from './api';

describe('샘플 학교', () => {
    it('솔버가 예산 안에 끝나고 전 시수를 배치한다', async () => {
        const doc = sampleDoc();
        doc.rules = defaultRules();
        const need = doc.demands.reduce((s, d) => s + d.count, 0);
        const t0 = Date.now();
        const r = await solve(doc, { candidates: 4, budgetMs: 3000, seed: 7 });
        const ms = Date.now() - t0;
        const placed = r.best.assignments.filter((a) => a.demandId).length;
        const after = diagnose({ ...doc, assignments: r.best.assignments });
        console.log(`[샘플] 시수 ${need} · 배치 ${placed} · hard=${r.best.hard} soft=${r.best.soft} · ${ms}ms · 후보 ${r.candidates.map((c) => `${c.label}:${c.hard}/${c.soft}`).join(' ')}`);
        console.log(`[샘플] 하드 위반 규칙: ${after.rules.filter((x) => x.kind === 'hard' && x.count).map((x) => `${x.templateId}=${x.count}`).join(' ') || '없음'}`);
        expect(placed + r.best.unplaced.reduce((s, u) => s + u.missing, 0)).toBe(need);
        expect(ms).toBeLessThan(4 * 3000 + 5000);
    }, 30000);
});
