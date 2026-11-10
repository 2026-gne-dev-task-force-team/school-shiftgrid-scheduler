/**
 * 끄는 동안 그리는 겹침 — 드롭 자리 선 + 포인터 따라다니는 고스트. useReorder 가 주는 drag·indicator 를 그리기만 한다.
 *   (창틀 Rail 의 겹침과 같은 꼴 — 컬렉션의 보기 탭·칸 머리·선택지 순서가 같은 것을 쓴다.)
 */
import { createPortal } from 'react-dom';
import type { DragLeafState } from '../../pane-ui-system/interactive/useDragLeaf';
import type { ReorderIndicator } from '../../pane-ui-system/interactive/useReorder';

export function ReorderOverlay({ drag, indicator, axis }: { drag: DragLeafState | null; indicator: ReorderIndicator | null; axis: 'x' | 'y' }) {
    if (!drag) return null;
    return createPortal(
        <div className="ui-chrome-nodrag fixed inset-0 z-tooltip pointer-events-none" data-rv-reorder-overlay>
            {indicator && (
                <div
                    className="absolute bg-accent rounded-full"
                    style={axis === 'x'
                        ? { left: indicator.line - 1.5, top: indicator.cross + 2, width: 3, height: indicator.size - 4 }
                        : { left: indicator.cross + 2, top: indicator.line - 1.5, width: indicator.size - 4, height: 3 }}
                />
            )}
            <div
                className="absolute flex items-center rounded-md border border-line bg-panel2 text-text text-body px-3 h-row shadow-lg opacity-90 truncate"
                style={{ left: drag.x + 12, top: drag.y + 12, maxWidth: 220 }}
            >
                <span className="truncate">{drag.title}</span>
            </div>
        </div>,
        document.body,
    );
}
