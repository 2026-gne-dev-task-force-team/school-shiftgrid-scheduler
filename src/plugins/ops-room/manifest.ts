/**
 * 「특별실 관리」 신분증 — 방 목록·고정 사용을 관리하고 옛 예약을 달력으로 옮긴다(예약 화면은 room-booking). ⛔ 코어 아님. id 는 폴더명과 같다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'ops-room',
    name: '특별실 관리',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    // 옛 예약 이사(T-10f7)가 쓰는 약속 — 없어도 켜지고(이사만 미룬다), 오면 붙는다.
    supports: { calendar: '^0.2', rooms: '^0.1', nodes: '^0.1', 'room-booking': '^0.1' },
    icon: 'list',
    description: '특별실 목록과 고정 사용을 관리하고, 옛 예약을 방 예약으로 옮깁니다.',
    about: {
        what: '특별실(방) 목록·정원·고정 사용을 관리하고 CSV 로 주고받습니다. 예약하기는 「방 예약」 화면에서 합니다.',
        use: ['특별실을 새로 만들거나 정원·고정 사용을 고칠 때', '옛 기기 예약을 방 예약으로 옮길 때(켜질 때 한 번 자동)'],
        off: '관리 화면만 사라집니다. 방·예약 자료는 그대로입니다.',
        with: '방 자료는 방 목록(rooms), 예약은 달력·방 예약이 맡습니다.',
    },
};
