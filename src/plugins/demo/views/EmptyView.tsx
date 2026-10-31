/** 데모 빈 뷰 — 사이드바가 트리로 무엇을 담는지 보여 줄 뿐이다(개요·속성). 이름·아이콘은 등록소가 준다. */
import type { ViewProps } from '../../../pane-ui-system/plugin';

export function EmptyView({ leaf: lf }: ViewProps) {
    return (
        <div className="h-full grid place-items-center px-6 text-center">
            <p className="text-[13px] text-muted/50 select-none truncate max-w-full">{lf.title} · (빈 뷰)</p>
        </div>
    );
}
