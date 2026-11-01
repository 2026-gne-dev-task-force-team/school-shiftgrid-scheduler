/**
 * interactive — 🔴 ⭐ 상호작용 로직이 사는 자리(쥔님 2026-11-01: *"상호작용 코드 잘 분리해놔"* ·
 *   *"인터렉티브 폴더 따로 만들어"*). 드래그·길게 누르기·포인터 제스처·전역 가드·재배열 훅이 여기 모인다.
 *
 * 🔴 ⛔ 레이아웃(layout/)·조각(primitives/)은 포인터 이벤트 핸들러를 직접 들지 않는다 — 전부 이 폴더를 거친다
 *    (구조 검사가 layout/ 에 포인터 핸들러가 들어오면 빨간불). layout 은 순수 기하, primitives 는 순수 그림.
 * ⛔ 도메인 0 — 이 폴더도 pane-ui-system 의 일부라 앱이 무엇인지 모른다(구조 검사 ⑤).
 */
export { useDragLeaf, type DragLeafState, type DragBind, type DragAxis, type UseDragLeafOpts } from './useDragLeaf';
export { useContextTrigger } from './useContextTrigger';
export { useReorder, type ReorderOpts } from './useReorder';
export { paneZone, tabDropSide, EDGE_BAND, type PaneZone, type Rect } from './drag-geometry';
