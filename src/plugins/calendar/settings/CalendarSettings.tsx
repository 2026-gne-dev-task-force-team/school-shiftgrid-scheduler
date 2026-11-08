/**
 * 「달력」 설정 판 — 「시험 기능 보기」 하나를 켠다(쥔님 2026-11-08).
 *   📌 2026-11-01 엔 분기·간트 토글 둘이었는데, 선생님이 실수로 켜면 당황한다는 쥔님 판단으로 하나로 합쳤다.
 *   스위치는 창틀 기본 부품 Toggle(배럴) — 설정 플러그인에만 있던 Toggle 을 primitives 로 올려 같이 쓴다.
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
                평소에는 년·월·주·일정 네 가지 보기만 씁니다. 아래를 켜면 아직 다듬는 중인 보기(분기·3일·하루·간트)도
                전환 단추에 같이 나옵니다.
            </p>
            <div className="flex flex-col">
                <OptionRow
                    k="experimental"
                    title="시험 기능 보기"
                    desc="분기·3일·하루·간트 보기를 전환 단추에 더합니다. 아직 다듬는 중이라 기본은 꺼져 있습니다."
                />
            </div>
        </div>
    );
}
