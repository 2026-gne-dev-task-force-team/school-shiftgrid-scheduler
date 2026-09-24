/**
 * 엔진 실물의 진입점 — api.ts 가 약속한 함수들을 모아 다시 내보낸다.
 * 구현은 이 폴더의 여러 파일에 나뉘어 있다:
 *   context.ts  buildContext (문맥·색인)
 *   spec.ts     makeSpec (규격 만들기)
 *   rules.ts    RULES · defaultRules (규칙 틀)
 *   evaluate.ts evaluateAll · diagnose · demandStatus
 *   move.ts     previewMove · applyMove · candidateCells
 *   solver.ts   solve · autoAdjust (자동 배정)
 */
export { buildContext } from './context';
export { makeSpec } from './spec';
export { RULES, defaultRules } from './rules';
export { evaluateAll, diagnose, demandStatus } from './evaluate';
export { previewMove, applyMove, candidateCells } from './move';
export { solve, autoAdjust } from './solver';
