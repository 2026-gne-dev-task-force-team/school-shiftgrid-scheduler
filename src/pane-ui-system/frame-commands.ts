/**
 * 창틀이 제공하는 동작의 명령 id — 🔴 ⭐ 「모든 동작은 명령」(쥔님 2026-11-01).
 *   창틀(frame)이 **이름(id)을 쥐고**, 실제 run 은 앱(Workbench)이 꽂는다 — 그래야 창틀이 도메인/앱을 몰라도
 *   탭 메뉴·우클릭 메뉴가 같은 commandId 로 가리킬 수 있다(구조 검사 ⑩이 commandId 를 못 박는다).
 *   ⛔ 창틀 메뉴는 핸들러를 직접 부르지 않는다 — 이 id 로 runCommand 를 거친다.
 */
export const FRAME_COMMAND = {
    closeTab: 'frame.tab.close',
    closeOthers: 'frame.tab.close-others',
    closeRight: 'frame.tab.close-right',
    splitRow: 'frame.tab.split-row',
    splitCol: 'frame.tab.split-col',
    moveLeft: 'frame.move.left',
    moveCenter: 'frame.move.center',
    moveRight: 'frame.move.right',
    newTab: 'frame.tab.new',
    openSettings: 'frame.view.settings',
    toggleLeft: 'frame.sidebar.toggle-left',
    toggleRight: 'frame.sidebar.toggle-right',
    palette: 'frame.palette',
} as const;

export type FrameCommandId = (typeof FRAME_COMMAND)[keyof typeof FRAME_COMMAND];
