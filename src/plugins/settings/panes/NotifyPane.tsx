/**
 * 「창틀 > 알림」 설정 Pane — 알림 기록을 몇 개까지 남길지(기기별).
 *   기본 200 · 0 = 이 세션 메모리에만(새로고침하면 비움). 줄이면 넘치는 옛 기록은 바로 잘린다.
 *   🔴 plugins/ 라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import { usePaneSettings, setPaneSettings, Button, FOCUS_RING } from '../../../pane-ui-system';
import { applyNotifyRetain, clearNotifications, useNotifications } from '../../../pane-ui-system/plugin';

export function NotifyPane() {
    const { settings } = usePaneSettings();
    const { items } = useNotifications();
    return (
        <div className="flex flex-col gap-4 max-w-[560px]">
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-text">알림 기록 보관 개수</div>
                    <div className="text-[12px] text-muted">
                        알림 패널에 남길 최근 알림 수 · 0 이면 새로고침하면 비웁니다 · 이 기기에만 저장됩니다
                    </div>
                </div>
                <input
                    type="number"
                    min={0}
                    max={1000}
                    value={settings.notifyRetain}
                    onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        setPaneSettings({ notifyRetain: Math.max(0, Math.min(1000, Math.round(n))) });
                        applyNotifyRetain();
                    }}
                    className={`shrink-0 w-24 h-btn px-2 rounded border border-line bg-bg text-text text-[13px] text-right ${FOCUS_RING}`}
                />
            </div>
            <div className="flex items-center justify-between gap-4 pt-4 border-t border-line">
                <div className="text-[12px] text-muted">지금 {items.length}건 보관 중</div>
                <Button onClick={clearNotifications} disabled={items.length === 0}>기록 비우기</Button>
            </div>
        </div>
    );
}
