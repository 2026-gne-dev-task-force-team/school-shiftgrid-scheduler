/**
 * 🔴 solver 인터페이스 모듈 — manifest.provides.solver 와 짝. host.modules.use<Solver>('solver') 가 이걸 받는다.
 *   엔진 함수(./engine/core)를 약속 꼴로 묶기만 한다 — 알고리즘은 v1 그대로.
 */
import type { Solver } from './contracts/solver';
import {
    buildContext, evaluateAll, diagnose, demandStatus, candidateCells, previewMove, applyMove,
    solve, autoAdjust, checkCapacity, RULES, defaultRules, makeSpec,
} from './engine/core';
import { migrateDoc } from './types/doc';
import { buildOfHost } from './BlockersBadge';
import { toWeekday, toDayIndex } from './day';

export const solverApi: Solver = {
    version: 1,
    buildContext, evaluateAll, diagnose, demandStatus, candidateCells, previewMove, applyMove,
    solve, autoAdjust, checkCapacity, RULES, defaultRules, makeSpec,
    readInput: (host) => buildOfHost(host)?.input ?? null,
    migrateDoc, toWeekday, toDayIndex,
};
