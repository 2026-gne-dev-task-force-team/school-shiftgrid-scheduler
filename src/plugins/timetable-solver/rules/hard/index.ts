/**
 * 하드(꼭 지킬) 규칙 9 — 낱개 기여를 v1 등록 순서대로 모은다. 안 쓰는 규칙은 여기 없다.
 *   🔴 순서는 v1 RULES 와 같다(진단·점수 순서가 바뀌지 않게) — rules/split-equivalence.test.ts 가 지킨다.
 */
import type { RuleContribution } from '../../contracts/rule';
import { noOverlapTrack } from './no-overlap-track';
import { noOverlapAgent } from './no-overlap-agent';
import { noOverlapResource } from './no-overlap-resource';
import { blockedCell } from './blocked-cell';
import { demandCount } from './demand-count';
import { blockContiguous } from './block-contiguous';
import { cycleOrder } from './cycle-order';
import { agentLunchFree } from './agent-lunch-free';
import { homeroomPlusFree } from './homeroom-plus-free';

export const HARD_RULES: readonly RuleContribution[] = [
    noOverlapTrack, noOverlapAgent, noOverlapResource, blockedCell, demandCount, blockContiguous, cycleOrder, agentLunchFree, homeroomPlusFree,
];
