/**
 * 소프트(되도록 지킬) 규칙 14 — 낱개 기여를 v1 등록 순서대로 모은다.
 *   🔴 순서는 v1 RULES 와 같다(진단·점수 순서가 바뀌지 않게) — rules/split-equivalence.test.ts 가 지킨다.
 */
import type { RuleContribution } from '../../contracts/rule';
import { avoid } from './avoid';
import { consecutiveLimit } from './consecutive-limit';
import { preferConsecutive } from './prefer-consecutive';
import { compactDay } from './compact-day';
import { subjectsPerDayAgent } from './subjects-per-day-agent';
import { subjectsPerDayTrack } from './subjects-per-day-track';
import { amPmBalance } from './am-pm-balance';
import { samePeriodAcrossDays } from './same-period-across-days';
import { subjectAdjacent } from './subject-adjacent';
import { dayCluster } from './day-cluster';
import { onePlacePerDay } from './one-place-per-day';
import { lunchAdjacent } from './lunch-adjacent';
import { dayLoadBalance } from './day-load-balance';
import { priorityEarly } from './priority-early';

export const SOFT_RULES: readonly RuleContribution[] = [
    avoid, consecutiveLimit, preferConsecutive, compactDay,
    subjectsPerDayAgent, subjectsPerDayTrack, amPmBalance, samePeriodAcrossDays,
    subjectAdjacent, dayCluster, onePlacePerDay, lunchAdjacent,
    dayLoadBalance, priorityEarly,
];
