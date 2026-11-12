/**
 * 「보결 목록·내 것」 신분증(P15) — 보결 줄(sub_slot)을 날짜·시각별로 보여 주고 내 것만 모아 본다. ⛔ 코어 아님. id 는 폴더명과 같다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'ops-sub',
    name: '보결 목록',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'list',
    description: '보결 줄을 날짜·시각별로 보고, 내가 맡은 줄과 내가 빠진 줄만 모아 봅니다.',
    about: {
        what: '그날 보결을 시각순으로 보여 주고, 「내 것」 판에서 내가 맡은 보결과 내가 빠진 보결을 따로 봅니다. 읽기 전용이며 누가 무엇을 보는지는 공개 범위 규칙을 따릅니다.',
        use: ['오늘 보결이 어느 반 몇 시에 있는지 볼 때', '내가 맡은 보결을 한눈에 볼 때'],
        off: '목록 화면만 사라집니다. 보결 자료는 그대로입니다.',
        with: '자료는 보결 서버 창구(list/source) 한 곳으로 읽습니다.',
    },
};
