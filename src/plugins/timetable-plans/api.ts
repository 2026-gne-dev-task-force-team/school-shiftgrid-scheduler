/**
 * 🔴 plans 인터페이스 모듈 — manifest.provides.plans 와 짝. host.modules.use<Plans>('plans') 가 이걸 받는다.
 */
import type { Plans } from './contracts/plans';
import { savePlan } from './nodes';

export const plansApi: Plans = { version: 1, savePlan };
