/** 데모 「표」 뷰 — 이름만 큼직하게. 진짜 내용은 P4 스케줄러가 꽂는다. */
import type { ViewProps } from '../../../pane-ui-system/plugin';

export function SheetView({ leaf: lf }: ViewProps) {
    return (
        <div className="h-full grid place-items-center px-6 text-center">
            <p className="text-2xl font-light text-muted/50 select-none truncate max-w-full">{lf.title}</p>
        </div>
    );
}
