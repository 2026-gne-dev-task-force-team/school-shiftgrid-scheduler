/**
 * 오른쪽 패널 — 머리 한 줄 + 빈 몸통. 이번 판에선 내용 없음(속성 폼은 범위 밖).
 */
import { Surface } from '../primitives/Surface';

export function RightPanel({ title }: { title: string }) {
    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 flex items-center h-9 px-3 border-b border-line">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-2">
                <Surface tone="bg" className="h-full w-full" />
            </div>
        </div>
    );
}
