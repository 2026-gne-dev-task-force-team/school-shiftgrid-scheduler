import { Button } from '../../pane-ui-system';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { RoomBooking } from '../room-booking/contracts/room-booking';

/** 예약하기 · 빈 방 찾기 · 내 예약은 「방 예약」 플러그인(room-booking)으로 옮겼다 — 여기엔 길잡이만 남긴다(지우는 판은 나중). */
export function RoomPanel({ host }: { host?: PluginHost }) {
    return (
        <div className="p-4 max-w-xl flex flex-col gap-3" data-ops-room-moved>
            <p className="text-body">방 예약으로 옮겼습니다. 예약하기 · 빈 방 찾기 · 내 예약은 「방 예약」 화면에서 합니다.</p>
            <div><Button variant="outline" onClick={() => { const rb = host?.modules.use<RoomBooking>('room-booking'); if (rb) host?.commands.run(rb.cmd.book); }}>방 예약 열기</Button></div>
        </div>
    );
}
