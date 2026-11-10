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
    reopenTab: 'frame.tab.reopen',
    splitRow: 'frame.tab.split-row',
    splitCol: 'frame.tab.split-col',
    moveLeft: 'frame.move.left',
    moveCenter: 'frame.move.center',
    moveRight: 'frame.move.right',
    newTab: 'frame.tab.new',
    openSettings: 'frame.view.settings',
    openNotify: 'frame.view.notify',
    toggleLeft: 'frame.sidebar.toggle-left',
    toggleRight: 'frame.sidebar.toggle-right',
    palette: 'frame.palette',
} as const;

export type FrameCommandId = (typeof FRAME_COMMAND)[keyof typeof FRAME_COMMAND];

/**
 * 사이드 패널 뷰 — 한 번 닫으면 다시 열 길이 있어야 한다(Q1·X7). 가운데 뷰는 탭이라 새 탭·리본으로 열고, 옆 패널은 이 이름의 명령으로 연다.
 * 명령 id 는 뷰 id 에서 정해진다 — 꾸러미가 리본에 꽂을 때도 같은 함수로 부른다(글자로 안 적는다).
 */
export const viewOpenCommandId = (viewId: string): string => `frame.view.open.${viewId}`;

/** 옆 패널로 열리는 뷰인가 — defaultArea 가 왼쪽·오른쪽 */
export const isSidePanelView = (v: { defaultArea?: 'left' | 'center' | 'right' }): v is { defaultArea: 'left' | 'right' } =>
    v.defaultArea === 'left' || v.defaultArea === 'right';
