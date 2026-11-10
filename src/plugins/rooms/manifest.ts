/**
 * 「방 목록」 신분증 — 학교를 모르는 방(공간) 목록 플러그인(요구명세 2026-11-08).
 *   ⛔ 코어 아님 — 설정 「플러그인」에서 끌 수 있다. id 는 폴더명과 같다(구조 검사 ⑧).
 *   방 목록(rooms.list)과 방(rooms.room) 노드 둘 + 방 목록 화면 하나. 예약·수용 수·과목 같은 건 ⛔ 안 만든다(위층 몫).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'rooms',
    name: '방 목록',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'door',
    description: '목록을 만들어 방·공간(이름·메모)을 담습니다.',
    about: {
        what: '목록을 만들어 방이나 공간을 담습니다. 방 안에 하위 방(건물 → 층 → 방)을 둘 수 있고, 엑셀이나 한글의 표를 복사해 붙이면 여러 방을 한 번에 넣을 수 있습니다.',
        use: [
            '건물·층·방 같은 공간 목록을 정리할 때',
            '엑셀·한글에 있던 공간 목록을 그대로 옮겨 올 때',
        ],
        off: '방 목록 화면이 사라집니다. 저장해 둔 방 목록은 지워지지 않고, 다시 켜면 그대로 보입니다.',
        with: '만든 방 목록은 탐색기 나무에 담깁니다.',
    },
};
