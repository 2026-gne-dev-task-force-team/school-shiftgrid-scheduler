/**
 * 「보결 명단」 신분증 — 보결 후보를 가를 교직원 명단(쥔님 2026-11-10 「딱 명단까지」).
 *   ⛔ 코어 아님 — 설정 「플러그인」에서 끌 수 있다. id 는 폴더명과 같다(구조 검사 ⑧).
 *   명단(substitute.list)·교직원(substitute.staff) 노드 둘 + 명단 화면 하나. 후보 등급·보결 등록·이력은 ⛔ 아직 없다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'substitute',
    name: '보결 명단',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'merge',
    description: '보결에 쓸 교직원 명단(이름·구분·메모)을 담습니다.',
    about: {
        what: '보결을 맡길 수 있는 교직원 명단을 만듭니다. 사람마다 구분(담임·전담·비교과·보조인력)을 고를 수 있고, 구분 선택지는 명단마다 고치거나 더할 수 있습니다. 엑셀이나 한글의 표를 복사해 붙이면 여러 명을 한 번에 넣을 수 있습니다.',
        use: [
            '학교 교직원을 보결 후보 구분과 함께 정리할 때',
            '엑셀·한글에 있던 교직원 명단을 그대로 옮겨 올 때',
        ],
        off: '보결 명단 화면이 사라집니다. 저장해 둔 명단은 지워지지 않고, 다시 켜면 그대로 보입니다.',
        with: '만든 보결 명단은 탐색기 나무에 담깁니다.',
    },
};
