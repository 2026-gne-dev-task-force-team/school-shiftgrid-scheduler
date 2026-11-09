/**
 * 블록 지우기 되돌리기 알림 — 편집기 내장 되돌리기 더미(doUndo)를 되돌린다(시트 행·열 지우기와 같은 꼴).
 *   뒤에 다른 편집이 쌓이면(isTop=false) 단추는 회색. 메뉴·선택 삭제에만 붙는다(타자 중 Backspace 합치기엔 안 붙는다).
 */
import type { PluginHost } from '../../pane-ui-system/plugin';

let removal: { run: () => void; isTop: () => boolean } | null = null;

export function notifyBlocksRemoved(host: PluginHost, title: string, run: () => void, isTop: () => boolean): void {
    removal = { run, isTop };
    host.notify({
        title,
        action: { label: '되돌리기', commandId: 'page.undoRemoved', unavailable: '이미 다른 작업이 있어 되돌릴 수 없습니다' },
        key: 'page.removed', timeout: 8000,
    });
}
export function blocksRemovedUndoable(): boolean { return !!removal?.isTop(); }
export function undoBlocksRemoved(): void { if (removal?.isTop()) removal.run(); }
