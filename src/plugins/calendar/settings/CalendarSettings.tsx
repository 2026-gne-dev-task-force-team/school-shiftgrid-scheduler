/**
 * 「캘린더」 설정 판 — 기본 꺼져 있는 보기 둘을 켠다(쥔님 2026-11-01 17:23).
 *   스위치는 창틀 기본 부품 Toggle(배럴) — 📌 처음엔 여기 따로 그렸다가 손잡이가 알약 밖으로 나갔다(17:39 쥔님
 *   *"이게 머꼬 혹시 토글 뷰 기본 컴포넌트가 아니고 따로 만드나"*). 설정 플러그인에만 있던 Toggle 을 primitives 로 올려 같이 쓴다.
 */
import { Toggle } from '../../../pane-ui-system';
import { setOption, useOptions, type CalendarOptions } from '../store';

function OptionRow({ k, title, desc }: { k: keyof CalendarOptions; title: string; desc: string }) {
    const opts = useOptions();
    return (
        <div className="flex items-start justify-between gap-4 py-2 border-b border-line last:border-b-0">
            <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-text">{title}</span>
                <span className="text-muted">{desc}</span>
            </div>
            <Toggle on={opts[k]} onToggle={(v) => setOption(k, v)} label={title} />
        </div>
    );
}

export function CalendarSettings() {
    return (
        <div className="flex flex-col gap-3 max-w-[560px] text-[13px] text-text">
            <p className="text-muted">
                캘린더 탭의 전환 단추에 보기를 더합니다. 기본은 둘 다 꺼져 있습니다.
            </p>
            <div className="flex flex-col">
                <OptionRow
                    k="dense"
                    title="분기 뷰"
                    desc="주 보기와 같은 시간축인데 열이 더 좁아 2주가 한눈에 들어옵니다. 시간의 패턴을 오밀조밀하게 볼 때."
                />
                <OptionRow
                    k="gantt"
                    title="간트 뷰"
                    desc="행은 항목, 열은 날(좁게). 일정을 오밀조밀하게 볼 때. 지금은 일정이 없어 빈 행뿐입니다."
                />
            </div>
        </div>
    );
}
