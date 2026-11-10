/**
 * 「창틀 > 알림」 설정 Pane — 알림 기록을 몇 개까지 남길지(기기별).
 *   기본 200 · 0 = 이 세션 메모리에만(새로고침하면 비움). 줄이면 넘치는 옛 기록은 바로 잘린다.
 *   🔴 plugins/ 라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import { useState } from 'react';
import { usePaneSettings, setPaneSettings, Button, ConfirmDialog, TextInput } from '../../..';
import { applyNotifyRetain, clearNotifications, useNotifications } from '../../../plugin';

export function NotifyPane() {
    const { settings } = usePaneSettings();
    const { items } = useNotifications();
    const [confirmClear, setConfirmClear] = useState(false);
    const errorCount = items.filter((i) => i.level === 'error').length;
    return (
        <div className="flex flex-col gap-4 max-w-[560px]">
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <div className="text-body font-semibold text-text">알림 기록 보관 개수</div>
                    <div className="text-small text-muted">
                        알림 패널에 남길 최근 알림 수 · 0 이면 새로고침하면 비웁니다 · 이 기기에만 저장됩니다
                    </div>
                </div>
                <TextInput
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
                    className="shrink-0 w-24 text-right"
                />
            </div>
            <div className="flex items-center justify-between gap-4 pt-4 border-t border-line">
                <div className="text-small text-muted">지금 {items.length}건 보관 중</div>
                <Button onClick={() => (errorCount > 0 ? setConfirmClear(true) : clearNotifications())} disabled={items.length === 0} disabledReason="지울 알림이 아직 없습니다.">모두 지우기</Button>
                {confirmClear && (
                    <ConfirmDialog title="오류 알림도 지울까요?" confirmLabel="모두 지우기" danger
                        onConfirm={() => { setConfirmClear(false); clearNotifications(); }} onCancel={() => setConfirmClear(false)}>
                        오류 알림 {errorCount}건이 들어 있습니다. 지우면 되돌릴 수 없습니다.
                    </ConfirmDialog>
                )}
            </div>
        </div>
    );
}
