/**
 * 🔴 ops-room 인터페이스 모듈 — manifest.provides['ops-room'] 와 짝. host.modules.use<OpsRoom>('ops-room') 가 이걸 받는다.
 */
import { CMD } from './contracts/ops-room';
import type { OpsRoom } from './contracts/ops-room';

export const opsRoomApi: OpsRoom = { version: 1, cmd: CMD };
