/**
 * 「창틀 > 리본」 설정 Pane — 왼쪽 아이콘 띠의 켜기/끄기 + 순서(위/아래). 드래그를 못 쓰는 사람용 대안(W8).
 *   ⭐ 리본에서 끌어 바꾸는 것과 같은 저장소(pane-settings.ribbon)를 만진다 — 어느 쪽으로 바꿔도 즉시 맞춰진다.
 *   🔴 ⛔ 창틀 코드가 뷰 id 의 뜻을 알 필요가 없다 — host.views.listRibbon() 목록을 돌며 그린다.
 *
 * 🔴 app/ 이라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import {
    usePaneSettings, resolveRibbon, nudgeId,
    setRibbonOrder, toggleRibbonHidden, resetRibbon,
    Icon,
} from '../../../pane-ui-system';
import type { SettingsPaneProps } from '../registry';

export function RibbonSettingsPane({ host }: SettingsPaneProps) {
    const { ribbon } = usePaneSettings();
    const { ordered } = resolveRibbon(host.views.listRibbon(), ribbon);
    const ids = ordered.map((v) => v.id);
    const hiddenSet = new Set(ribbon.hidden);

    if (ordered.length === 0) {
        return <p className="text-[12px] text-muted">리본에 올릴 뷰가 아직 없습니다.</p>;
    }

    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <p className="text-[12px] text-muted">
                리본 아이콘을 끌어 순서를 바꾸거나, 여기서 켜고 끌 수 있습니다. 저장은 이 기기에만 남습니다.
            </p>
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {ordered.map((v, i) => {
                    const on = !hiddenSet.has(v.id);
                    return (
                        <div
                            key={v.id}
                            className={`flex items-center gap-2 px-3 h-row border-b border-line last:border-b-0
                                ${on ? 'text-text' : 'text-muted bg-text/[0.02]'}`}
                        >
                            <Icon name={v.icon ?? 'dot'} size={16} className="shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-[13px]">{v.title}</span>

                            <button
                                type="button"
                                aria-pressed={on}
                                onClick={() => toggleRibbonHidden(v.id, on)}
                                className={`h-7 px-2 rounded border text-[12px] transition-colors
                                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                                    ${on ? 'border-accent text-text bg-text/[0.06]' : 'border-line text-muted hover:text-text hover:bg-text/[0.04]'}`}
                            >
                                {on ? '켜짐' : '꺼짐'}
                            </button>

                            <button
                                type="button"
                                aria-label={`${v.title} 위로`}
                                title="위로"
                                disabled={i === 0}
                                onClick={() => setRibbonOrder(nudgeId(ids, v.id, -1))}
                                className="grid place-items-center w-7 h-7 rounded border border-line text-muted
                                    enabled:hover:text-text enabled:hover:bg-text/[0.04] disabled:opacity-30
                                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                            >
                                <Icon name="left" size={14} className="-rotate-90" />
                            </button>
                            <button
                                type="button"
                                aria-label={`${v.title} 아래로`}
                                title="아래로"
                                disabled={i === ordered.length - 1}
                                onClick={() => setRibbonOrder(nudgeId(ids, v.id, 1))}
                                className="grid place-items-center w-7 h-7 rounded border border-line text-muted
                                    enabled:hover:text-text enabled:hover:bg-text/[0.04] disabled:opacity-30
                                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                            >
                                <Icon name="right" size={14} className="rotate-90" />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div>
                <button
                    type="button"
                    onClick={resetRibbon}
                    className="h-btn px-3 rounded border border-line text-[13px] text-muted
                        hover:text-text hover:bg-text/[0.04] transition-colors
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                    기본 순서로
                </button>
            </div>
        </div>
    );
}
