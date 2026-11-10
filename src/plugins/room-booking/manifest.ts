/**
 * 「방 예약」 신분증 — 달력 프리셋 한 장 + 방 목록(rooms)을 엮는다(요구명세 설계 4·4-2). 예약 저장소 = 달력 저장소 그 자체 · 낱말·「방」 칸·첫 화면만 바꾼다.
 *   ⛔ 코어 아님 — 설정 「플러그인」에서 끌 수 있다. id 는 폴더명과 같다(구조 검사 ⑧). ⛔ 겹침 검사·학교 낱말은 안 둔다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'room-booking',
    name: '방 예약',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'key',
    requires: { calendar: '^0.2', rooms: '^0.1', nodes: '^0.1' },
    supports: { collection: '^0.2' },
    description: '달력에 「방 예약」 저장소를 더합니다.',
    about: {
        what: '달력 저장소를 「방 예약」으로 만듭니다. 예약마다 방을 고를 수 있고, 첫 화면은 주 단위 시간표입니다.',
        use: ['방이나 공간을 시간대별로 예약해 둘 때'],
        off: '예약 저장소가 기본 달력으로 보입니다. 적어 둔 예약과 방 목록은 지워지지 않고, 다시 켜면 그대로 보입니다.',
        with: '방 목록 플러그인의 방을 예약마다 고릅니다. 「새 방 예약」으로 만들면 있는 방 목록을 같이 쓰고, 없으면 옆에 하나 만듭니다.',
    },
};
