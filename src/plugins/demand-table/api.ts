/**
 * 🔴 demand-table 인터페이스 모듈 — manifest.provides['demand-table'] 와 짝. 명령 id 상수만 돌려준다.
 */
import type { DemandTable } from './contracts/demand-table';
import { CMD } from './contracts/commands';

export const demandTableApi: DemandTable = { version: 1, cmd: CMD };
