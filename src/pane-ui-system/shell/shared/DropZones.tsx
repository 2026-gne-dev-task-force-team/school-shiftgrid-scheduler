/**
 * 드롭 존 오버레이 — 드래그 중에만 뜬다. 들어갈 자리를 파란 반투명 미리보기로 그리고,
 * 고스트(잡은 탭 카드)가 포인터를 따라다닌다. 어디로 가는지 판정은 resolveDropAt(drop-resolve)이 한다.
 *
 * 🔴 색은 토큰(accent)으로만 · 오버레이·고스트는 pointer-events:none + .ui-chrome-nodrag
 *    (elementFromPoint 가 이들을 뚫고 아래 진짜 DOM 을 집어야 존 판정이 선다).
 */
import { createPortal } from 'react-dom';
import type { DragLeafState } from '../../interactive/useDragLeaf';
import { resolveDropAt, type DropBox, type DropPreview } from './drop-resolve';

/** 가장자리 존의 「반쪽 면」 사각형 */
function edgeBox(box: DropBox, zone: 'left' | 'right' | 'up' | 'down'): DropBox {
    const hw = box.width / 2;
    const hh = box.height / 2;
    switch (zone) {
        case 'left': return { ...box, width: hw };
        case 'right': return { left: box.left + hw, top: box.top, width: hw, height: box.height };
        case 'up': return { ...box, height: hh };
        case 'down': return { left: box.left, top: box.top + hh, width: box.width, height: hh };
    }
}

function PreviewShape({ preview }: { preview: DropPreview }) {
    if (preview.kind === 'tab') {
        // 세로 선 — 탭의 왼끝(before) 또는 오른끝(after)
        const x = preview.side === 'before' ? preview.box.left : preview.box.left + preview.box.width;
        return (
            <div
                className="absolute bg-accent rounded-full"
                style={{ left: x - 1.5, top: preview.box.top + 2, width: 3, height: preview.box.height - 4 }}
            />
        );
    }
    const box = preview.kind === 'edge' ? edgeBox(preview.box, preview.zone) : preview.box;
    return (
        <div
            className="absolute bg-accent/20 border-2 border-accent/60 rounded-md"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
    );
}

export function DropZones({ drag, dragViewId }: { drag: DragLeafState; dragViewId?: string }) {
    // 🔴 dragViewId 를 넘겨 placement 를 같이 본다 — 허용 안 되는 자리면 미리보기(res)가 null 이라 파란 면이 안 뜬다.
    const res = resolveDropAt(drag.x, drag.y, drag.leafId, dragViewId);
    const ghostW = Math.max(96, Math.min(220, drag.width || 140));
    return createPortal(
        // 🔴 오버레이는 뷰포트를 덮되 pointer-events:none — elementFromPoint 가 뚫고 아래 진짜 DOM 을 집는다
        <div className="ui-chrome-nodrag fixed inset-0 z-[60] pointer-events-none">
            {res && <PreviewShape preview={res.preview} />}
            {/* 고스트 — 잡은 탭 모양 작은 카드가 포인터를 따라다닌다 */}
            <div
                className="absolute flex items-center rounded-md border border-line bg-panel2 text-text text-body px-3 h-topbar shadow-lg opacity-90 truncate"
                style={{ left: drag.x + 12, top: drag.y + 12, width: ghostW }}
            >
                <span className="truncate">{drag.title}</span>
            </div>
        </div>,
        document.body,
    );
}
