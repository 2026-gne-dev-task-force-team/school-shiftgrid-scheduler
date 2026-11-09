/**
 * 「창틀 > 리본」 설정 Pane — 리본 아이콘의 켜기/끄기 + 순서. 🔴 순서는 끌어서(드래그) 바꾼다(항목 I).
 *   ⭐ 리본에서 끌어 바꾸는 것과 같은 저장소(pane-settings.ribbon)·같은 공용 훅(interactive/useReorder)을 쓴다 —
 *      어느 쪽으로 바꿔도 즉시 맞춰진다. 드래그를 못 쓰는 사람용으로 위/아래 단추·Alt+방향키도 남긴다.
 *   🔴 ⛔ 창틀 코드가 뷰 id 의 뜻을 알 필요가 없다 — resolveRibbonEntries 목록을 돌며 그린다.
 *
 * 🔴 plugins/ 라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import { createPortal } from 'react-dom';
import {
    usePaneSettings, nudgeId, useReorder,
    setRibbonOrder, toggleRibbonHidden, resetRibbon,
    Icon, Button, FOCUS_RING,
} from '../../../pane-ui-system';
import { resolveRibbonEntries, useContribVersion } from '../../../pane-ui-system/plugin';
import type { SettingsPaneProps } from '../registry';

export function RibbonSettingsPane(_: SettingsPaneProps) {
    const { ribbon } = usePaneSettings();
    useContribVersion();
    const { ordered } = resolveRibbonEntries(ribbon);
    const ids = ordered.map((v) => v.id);
    const hiddenSet = new Set(ribbon.hidden);

    // 🔴 리본과 같은 공용 재배열 훅 — 세로 목록이라 axis='y'. 끌면 setRibbonOrder 로 저장된다
    const { containerRef, bind, drag, indicator, onKeyDown } = useReorder<HTMLDivElement>({
        ids, axis: 'y', onReorder: setRibbonOrder,
    });

    if (ordered.length === 0) {
        return <p className="text-small text-muted">리본에 올릴 아이콘이 아직 없습니다.</p>;
    }

    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <p className="text-small text-muted">
                줄을 끌어(또는 Alt+↑/↓) 순서를 바꾸고, 켜고 끌 수 있습니다. 저장은 이 기기에만 남습니다.
            </p>
            <div
                ref={containerRef}
                className="flex flex-col rounded border border-line overflow-hidden"
                onKeyDown={onKeyDown}
                {...bind}
            >
                {ordered.map((v, i) => {
                    const on = !hiddenSet.has(v.id);
                    return (
                        <div
                            key={v.id}
                            data-row-id={v.id}
                            tabIndex={0}
                            className={`flex items-center gap-2 px-3 h-row border-b border-line last:border-b-0 cursor-grab select-none
                                ${FOCUS_RING}
                                ${on ? 'text-text' : 'text-muted bg-text/[0.02]'}`}
                        >
                            <Icon name="grip" size={16} className="shrink-0 text-muted" />
                            <Icon name={v.icon ?? 'dot'} size={16} className="shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-body">{v.title}</span>

                            <Button
                                size="sm"
                                variant={on ? 'accent' : 'ghost'}
                                aria-pressed={on}
                                onClick={() => toggleRibbonHidden(v.id, on)}
                            >
                                {on ? '켜짐' : '꺼짐'}
                            </Button>

                            <button
                                type="button"
                                aria-label={`${v.title} 위로`}
                                title="위로"
                                disabled={i === 0}
                                onClick={() => setRibbonOrder(nudgeId(ids, v.id, -1))}
                                className={`grid place-items-center w-7 h-7 rounded border border-line text-muted
                                    enabled:hover:text-text enabled:hover:bg-text/[0.04] disabled:opacity-30
                                    ${FOCUS_RING}`}
                            >
                                <Icon name="left" size={14} className="-rotate-90" />
                            </button>
                            <button
                                type="button"
                                aria-label={`${v.title} 아래로`}
                                title="아래로"
                                disabled={i === ordered.length - 1}
                                onClick={() => setRibbonOrder(nudgeId(ids, v.id, 1))}
                                className={`grid place-items-center w-7 h-7 rounded border border-line text-muted
                                    enabled:hover:text-text enabled:hover:bg-text/[0.04] disabled:opacity-30
                                    ${FOCUS_RING}`}
                            >
                                <Icon name="right" size={14} className="rotate-90" />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div>
                <Button variant="ghost" size="md" onClick={resetRibbon}>
                    기본 순서로
                </Button>
            </div>

            {/* 드래그 미리보기 선 — 포털로 뷰포트에 그린다(스크롤 칸 안에서도 자리가 맞게) */}
            {drag && indicator && createPortal(
                <div className="ui-chrome-nodrag fixed inset-0 z-[60] pointer-events-none">
                    <div
                        className="absolute bg-accent rounded-full"
                        style={{ left: indicator.cross + 2, top: indicator.line - 1.5, width: indicator.size - 4, height: 3 }}
                    />
                </div>,
                document.body,
            )}
        </div>
    );
}
