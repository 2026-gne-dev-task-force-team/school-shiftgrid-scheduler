/** 🔴 duty 인터페이스 모듈 — manifest.provides.duty 와 짝. 순수 셈을 그대로 낸다(저장소를 안 읽는다). */
import type { Duty } from './contracts/duty';
import { parsePeriods, absentAt, absentPeople } from './absence';

export const dutyApi: Duty = { version: 1, parsePeriods, absentAt, absentPeople };
