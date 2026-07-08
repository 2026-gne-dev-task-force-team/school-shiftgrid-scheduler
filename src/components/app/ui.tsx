/** 화면 공용 조각들 — 칩, 드래그 데이터 규칙, 색 팔레트 */
import type { CellField } from '../../store/store';

/** 새 항목에 돌려가며 쓰는 기본 색들 */
export const PALETTE = ['#4F7CFF', '#FF6B6B', '#2ECC71', '#9B59B6', '#F39C12', '#E91E63', '#00BCD4', '#795548', '#607D8B'];

/** 드래그하는 항목의 종류 (교사·교과·시설) */
export type DragKind = 'agent' | 'activity' | 'resource';

/** 종류 → 배치의 어느 칸(field)에 들어가는지 */
export const FIELD_OF: Record<DragKind, CellField> = {
    agent: 'agentId', activity: 'activityId', resource: 'resourceId',
};

export const DRAG_MIME = 'application/x-shiftgrid';
export const encodeDrag = (kind: DragKind, id: string) => `${kind}:${id}`;
export function decodeDrag(s: string): { kind: DragKind; id: string } | null {
    const [kind, id] = s.split(':');
    if (!kind || !id) return null;
    return { kind: kind as DragKind, id };
}

/** 색 있는 칩 하나 (× 로 제거) */
export function Chip({
    name, color, onRemove, title,
}: { name: string; color: string; onRemove?: () => void; title?: string }) {
    return (
        <span
            title={title}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-white whitespace-nowrap max-w-full"
            style={{ backgroundColor: color }}
        >
            <span className="truncate">{name}</span>
            {onRemove && (
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="opacity-70 hover:opacity-100 leading-none"
                >×</button>
            )}
        </span>
    );
}
