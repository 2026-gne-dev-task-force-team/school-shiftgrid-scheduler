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
    description: '방 목록 — 목록을 나눠 방을 담고(이름·메모), 방 안에 방을 둘 수 있고, 엑셀·한글 표를 붙여 넣어 여럿 추가. 학교·예약·계정 모름.',
};
