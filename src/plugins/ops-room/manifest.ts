/**
 * 「특별실 예약」 신분증(P19) — 방 칸을 보고 예약·취소하고 내 예약을 모아 본다. ⛔ 코어 아님. id 는 폴더명과 같다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'ops-room',
    name: '특별실 예약',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'list',
    description: '특별실 칸을 보고 반 단위로 예약하고, 내 예약을 모아 봅니다.',
    about: {
        what: '날짜·시각을 고르면 자리가 남은 방을 보여 주고, 반 이름으로 예약합니다. 고정 수업이 있는 칸은 잠기고, 같은 반 중복·정원 초과·지난 날은 막힙니다.',
        use: ['특별실을 반 수업에 쓰려고 잡을 때', '내가 잡은 예약을 확인·취소할 때'],
        off: '예약 화면만 사라집니다. 예약 자료는 그대로입니다.',
        with: '자료는 특별실 서버 창구(book/source) 한 곳으로 읽고 씁니다.',
    },
};
