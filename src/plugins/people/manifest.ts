/**
 * 「사람 명단」 신분증 — 학교를 모르는 사람 명단 플러그인(요구명세 2026-11-08).
 *   ⛔ 코어 아님 — 설정 「플러그인」에서 끌 수 있다. id 는 폴더명과 같다(구조 검사 ⑧).
 *   명단(people.list)과 사람(people.person) 노드 둘 + 명단 화면 하나. 뽑기·조 나누기 같은 쓰임새는 ⛔ 안 만든다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'people',
    name: '사람 명단',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'users',
    description: '명단을 만들어 사람(이름·메모)을 담습니다.',
    about: {
        what: '명단을 만들어 사람을 담습니다. 사람마다 이름과 메모를 적을 수 있고, 엑셀이나 한글의 표를 복사해 붙이면 여러 명을 한 번에 넣을 수 있습니다.',
        use: [
            '반·동아리·부서 같은 사람 목록을 정리할 때',
            '엑셀·한글에 있던 명단을 그대로 옮겨 올 때',
        ],
        off: '사람 명단 화면이 사라집니다. 저장해 둔 명단은 지워지지 않고, 다시 켜면 그대로 보입니다.',
        with: '만든 명단은 탐색기 나무에 담깁니다.',
    },
};
