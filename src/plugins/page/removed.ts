/**
 * 블록 지우기 되돌리기 알림 — 편집기 내장 되돌리기 더미(doUndo)를 되돌린다(시트 행·열 지우기와 같은 꼴 · 창틀 createUndoSlot).
 *   뒤에 다른 편집이 쌓이면(isTop=false) 단추는 회색. 메뉴·선택 삭제에만 붙는다(타자 중 Backspace 합치기엔 안 붙는다).
 */
import { createUndoSlot } from '../../pane-ui-system/plugin';

const slot = createUndoSlot({ commandId: 'page.undoRemoved', key: 'page.removed' });

export const notifyBlocksRemoved = slot.notify;
export const blocksRemovedUndoable = slot.undoable;
export const undoBlocksRemoved = slot.undo;
