/**
 * 🔴 약속 「ops-room」 0.1.0 — 특별실 관리 조각이 내놓는 명령 id(글자 상수뿐 · 함수 0).
 *   다른 조각(방 예약 화면 등)은 명령 id 를 글자로 부르지 않고 host.modules.use<OpsRoom>('ops-room').cmd.openManage 로 받는다
 *   (남의 contracts 값 import ⛔ · 톱니 cmdIdString).
 *   ⚠️ 매니페스트(index.ts contributes.commands)의 id 와 한 벌이어야 한다.
 */
export const CMD = {
    openManage: 'ops-room.open-manage',
} as const;

export interface OpsRoom {
    readonly version: 1;
    /** 명령 id 상수 — host.commands.run(opsRoom.cmd.openManage). */
    readonly cmd: typeof CMD;
}
