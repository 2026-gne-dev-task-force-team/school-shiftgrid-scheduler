/**
 * 방이 0개일 때의 안내 — 「특별실 관리에서 방을 먼저 더해 주세요」 + 「특별실 관리 열기」 단추(ops-room 약속의 cmd.openManage).
 *   예약하기 화면(RoomBookingView)과 리본이 여는 달력 예약 목록(프리셋 banner) 둘이 같은 조각을 쓴다.
 */
import { useEffect, useState } from 'react';
import { Button } from '../../pane-ui-system';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { OpsRoom } from '../ops-room/contracts/ops-room';
import type { Rooms } from '../rooms/contracts/rooms';
import { allRooms } from './bookings';

/** 안내 문구 둘 + 단추 — 방이 없다고 이미 판정한 쪽이 그대로 얹는다. */
export function RoomEmptyHelp({ host, lead }: { host: PluginHost; lead?: string }) {
    const opsRoom = host.modules.use<OpsRoom>('ops-room');
    return (
        <div className="flex flex-col gap-2" data-room-free-empty>
            {lead && <p className="text-small">{lead}</p>}
            <p className="text-small text-muted">특별실 관리에서 방을 먼저 더해 주세요.</p>
            {opsRoom && <div><Button variant="outline" data-room-open-manage onClick={() => host.commands.run(opsRoom.cmd.openManage)}>특별실 관리 열기</Button></div>}
        </div>
    );
}

/** 달력 예약 목록 맨 위 띠 — 방이 하나라도 있으면 아무것도 안 그린다. 방이 바뀌면 다시 센다. */
export function RoomEmptyBanner({ host }: { host: PluginHost }) {
    const rooms = host.modules.use<Rooms>('rooms');
    const [, bump] = useState(0);
    useEffect(() => {
        const d = rooms?.onChange(() => bump((n) => n + 1));
        return () => { d?.dispose(); };
    }, [rooms]);
    if (!rooms || allRooms(rooms).length > 0) return null;
    return <div className="shrink-0 px-pad py-2 border-b border-line bg-panel" data-room-empty-banner><RoomEmptyHelp host={host} /></div>;
}
