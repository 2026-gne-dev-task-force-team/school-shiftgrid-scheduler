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
    description: '사람 명단 — 명단을 나눠 사람을 담고(이름·메모), 엑셀·한글 표를 붙여 넣어 여럿 추가. 학교·계정 모름.',
};
