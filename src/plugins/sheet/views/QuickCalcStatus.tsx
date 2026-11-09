/** 앱 아래 상태바의 표 합계 — 범위면 합·평균·최소·최대·개수, 칸 하나면 그 칸 원래 값. 표에 포커스가 없으면 비운다. */
import { useQuickCalc } from '../store';

export function QuickCalcStatus() {
    const text = useQuickCalc();
    if (text == null) return null;
    return <span data-testid="quick-calc" className="tabular-nums truncate select-none">{text}</span>;
}
