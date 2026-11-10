/**
 * 리본 시트(좁은 화면) — 하단 바 ▤ 를 누르면 아래에서 올라오는 액션 시트(쥔님 2026-11-01 ⑤:
 *   *"모바일에 리본 메뉴가 없네. 내비게이터에 리본 버튼, 누르면 아래에서 시트가 나와서 액션을 누를 수 있게"*).
 *   리본에 꽂은 동작(host.ribbon.add)을 아이콘+이름 세로 목록으로 — 누르면 그 동작을 실행하고 시트는 닫힌다.
 *
 * 🔴 ⛔ 창틀은 그 아이콘이 무슨 뷰인지(도메인) 모른다 — 등록소 목록을 돌며 그릴 뿐이고, 누르면 onOpenView(id) 로 앱에 넘긴다.
 * 🔴 숨긴 리본 항목은 안 뜬다(판 C 의 hidden 존중) — resolveRibbon 이 visible 만 내준다. 데스크톱 리본(Rail)과 같은 저장소다.
 * ⛔ 색·치수는 토큰으로만.
 */
import { BottomSheet } from '../../primitives/BottomSheet';
import { Icon } from '../../primitives/Icon';
import { FOCUS_RING } from '../../primitives/focus';
import { usePaneSettings } from '../../layout/pane-settings';
import { resolveRibbonEntries, useContribVersion, type RibbonEntry } from '../../plugin';

export function RibbonSheet({
    open, onClose, onOpenView,
}: {
    open: boolean;
    onClose: () => void;
    /** 뷰 항목을 누르면 그 뷰를 연다(동작 항목은 run 을 직접 부른다). 고른 뒤 시트는 닫힌다 */
    onOpenView: (viewId: string) => void;
}) {
    const { ribbon } = usePaneSettings();
    useContribVersion();
    const { visible } = resolveRibbonEntries(ribbon);
    const pick = (v: RibbonEntry) => {
        if (v.kind === 'action') v.run?.(); else onOpenView(v.id);
        onClose();
    };
    return (
        <BottomSheet open={open} onClose={onClose} label="리본">
            <div className="flex flex-col p-pad gap-0.5">
                {visible.map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => pick(v)}
                        data-ribbon-kind={v.kind}
                        aria-label={v.title}
                        className={`flex items-center gap-3 h-row px-pad rounded text-text select-none transition-colors
                            hover:bg-text/[0.06] ${FOCUS_RING}`}
                    >
                        <Icon name={v.icon ?? 'dot'} size={18} />
                        <span className="min-w-0 flex-1 truncate text-left text-lead">{v.title}</span>
                    </button>
                ))}
                {visible.length === 0 && (
                    <p className="px-pad py-6 text-center text-body text-muted/80 select-none">리본에 올린 항목이 없습니다.</p>
                )}
            </div>
        </BottomSheet>
    );
}
