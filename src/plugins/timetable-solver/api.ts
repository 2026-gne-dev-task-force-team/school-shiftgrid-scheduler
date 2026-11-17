/**
 * 🔴 solver 인터페이스 모듈 — manifest.provides.solver 와 짝. host.modules.use<Solver>('solver') 가 이걸 받는다.
 *   엔진 함수(./engine/core)를 약속 꼴로 묶기만 한다 — 알고리즘은 v1 그대로.
 */
import type { Solver } from './contracts/solver';
import type { PluginHost } from '../../pane-ui-system/plugin';
import {
    buildContext, evaluateAll, diagnose, demandStatus, candidateCells, previewMove, applyMove,
    solve, autoAdjust, checkCapacity, RULES, defaultRules, makeSpec,
} from './engine/core';
import { migrateDoc } from './types/doc';
import { buildOfHost } from './BlockersBadge';
import { evaluatePlan } from './plan-eval';
import { toWeekday, toDayIndex } from './day';

// 🔴 엔진 자기 host — 켜질 때(onActivate) 쥐고 꺼질 때 놓는다. readInput 은 이 host 로만 정본을 읽는다(T-10fe).
let selfHost: PluginHost | null = null;
export function bindSolverHost(host: PluginHost | null): void { selfHost = host; }

export const solverApi: Solver = {
    version: 1,
    buildContext, evaluateAll, diagnose, evaluate: evaluatePlan, demandStatus, candidateCells, previewMove, applyMove,
    solve, autoAdjust, checkCapacity, RULES, defaultRules, makeSpec,
    readInput: () => (selfHost ? buildOfHost(selfHost)?.input ?? null : null),
    migrateDoc, toWeekday, toDayIndex,
};
