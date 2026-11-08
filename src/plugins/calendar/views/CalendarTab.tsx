/**
 * 달력 탭 — 구글 캘린더처럼 **탭 하나 안에서 년·월·주·3일·하루를 단추로 전환**한다(쥔님 2026-11-01 17:06
 *   *"연간 뷰 필요하네 … 주간뷰 3일뷰 하루 스케줄 뷰도 필요하네"* — 탭 다섯이 아니라 한 탭의 다섯 모습).
 *   각 뷰는 머리줄 오른쪽 끝 `trailing` 자리에 이 전환 단추를 그대로 그린다.
 *   17:23 — 설정에서 켜면 「분기」「간트」 단추가 더 붙는다(기본 꺼짐 · store.ts).
 *   🔴 ⛔ 일정 없음 — 전부 눈금뿐이다. 어느 모습을 보고 있었나(mode)도, 보고 있는 날짜(anchor)도 ⛔ 저장 안 함.
 *
 *   📌 21:47 쥔님 *"월이 왜 계속 2024년에 가가있노 … 다른 뷰도 다 다른데로 가가 있네"* →
 *      「보고 있는 날짜」를 각 뷰가 제각기 쥐던 걸 여기(anchor) 하나로 끌어올렸다. 그 한 수로 둘이 같이 풀린다:
 *      ① 월 보기가 초기 scrollTop 을 안 잡아 맨 위(104주 전=2024년)로 가 있던 것 ② 뷰를 바꾸면 각자 오늘로 리셋되던 것.
 *      각 뷰는 제 날짜 useState 를 버리고 value 를 쓰고, 스크롤·단추로 옮기면 onChange 로 올린다(한쪽만 흐른다 — 루프 방지).
 */
import { useEffect, useState } from 'react';
import { Icon, type PeekHandle } from '../../../pane-ui-system';
import { MonthView } from './MonthView';
import { YearView } from './YearView';
import { TimeGridView } from './TimeGridView';
import { ListView } from './ListView';
import { GanttView } from './GanttView';
import { useOptions, useScope, setScope } from '../store';
import { useCalendarData } from '../useEvents';
import { visibleModes, resolveMode, type Mode } from '../modes';
import { selectionLabel, type CalSelection } from '../selection';

const DENSE_DAYS = 14;   // 「분기 뷰」 — 2주. 쥔님: 분기 단위로 자르는 게 아니라 주보다 촘촘한 시간축

export function CalendarTab({ peek }: { peek: PeekHandle }) {
    const [mode, setMode] = useState<Mode>('month');
    // 🔴 「보고 있는 날짜」의 단일 진실 — 초기값은 오늘. 각 뷰에 value 로 내리고 onChange 로 받는다(뷰를 바꿔도 유지된다).
    const [anchor, setAnchor] = useState<Date>(() => new Date());
    // 🔴 「범위 선택」의 단일 진실 — 모드를 바꿔도 남는다(쥔님 2026-11-02 *"선택할 수 있게 해줘 … 모든 뷰다"*). ⛔ 저장 안 함.
    const [selection, setSelection] = useState<CalSelection>(null);
    const opts = useOptions();
    const scope = useScope();
    const { stores } = useCalendarData();
    const scopeStore = scope ? stores.get(scope) : null;

    // 순서 배열 하나(ALL_MODES)로 고정하고, 지금 보일 것만 거른다 — 끝에 push 하면 순서가 틀어졌다(쥔님 22:17).
    const modes = visibleModes(opts.experimental);

    // 보고 있던 모드가 지금 안 보이면(시험 기능을 껐다) 월로 돌아간다 — resolveMode 한 곳으로.
    useEffect(() => {
        const next = resolveMode(mode, opts.experimental);
        if (next !== mode) setMode(next);
    }, [mode, opts.experimental]);

    // 🔴 범위 저장소가 휴지통에 가거나 사라지면 자동으로 전체(null)로 — 죽은 저장소에 갇히지 않게(쥔님 2026-11-02).
    useEffect(() => {
        if (scope && !stores.has(scope)) setScope(null);
    }, [scope, stores]);

    // Esc 로 범위 선택 해제 — 선택이 있을 때만(점프 판·검색 Esc 와 공존). 뷰 어디든 받게 창(window)에 건다.
    useEffect(() => {
        if (!selection) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelection(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selection]);

    // 전환 단추. (작은 달력 여는 단추는 23:27 쥔님 *"요 버튼은 이제 없어져도 될듯"* — 리본에 있고 기본 오른쪽이라 걷었다)
    //   범위 저장소가 있으면 왼쪽에 「📁 <이름> · 전체」 칩을 붙인다(쥔님 2026-11-02: 저장소를 열면 그 저장소 것만 · 「전체」로 되돌림).
    const switcher = (
        <div className="flex items-center gap-1 ml-1">
            {scopeStore && (
                <span className="flex items-center gap-1 h-btn pl-2 pr-1 rounded border border-line text-[12px]" title={`「${scopeStore.name}」 저장소 범위`}>
                    <Icon name="folder" size={12} className="shrink-0 text-accent" />
                    <span className="truncate max-w-[9rem] text-text">{scopeStore.name}</span>
                    <button
                        type="button"
                        onClick={() => setScope(null)}
                        className="ml-0.5 px-1 rounded text-muted hover:text-text hover:bg-text/[0.06] transition-colors"
                        title="전체 저장소 보기"
                    >
                        전체
                    </button>
                </span>
            )}
            {selection && (
                <span className="flex items-center gap-1 h-btn pl-2 pr-1 rounded border border-accent/60 bg-accent/[0.08] text-[12px]" title="고른 범위">
                    <span className="truncate max-w-[18rem] text-text tabular-nums">{selectionLabel(selection)}</span>
                    <button
                        type="button"
                        onClick={() => setSelection(null)}
                        className="ml-0.5 px-1 rounded text-muted hover:text-text hover:bg-text/[0.06] transition-colors"
                        title="선택 해제"
                        aria-label="선택 해제"
                    >
                        ✕
                    </button>
                </span>
            )}
            <div role="tablist" aria-label="보기 전환" className="flex items-center rounded border border-line overflow-hidden">
                {modes.map((m) => (
                    <button
                        key={m.id}
                        type="button"
                        role="tab"
                        aria-selected={mode === m.id}
                        onClick={() => setMode(m.id)}
                        className={`px-2 h-btn text-[12px] border-l border-line first:border-l-0 transition-colors
                            ${mode === m.id ? 'bg-text/[0.08] text-text font-medium' : 'text-muted hover:text-text hover:bg-text/[0.04]'}`}
                    >
                        {m.label}
                    </button>
                ))}
            </div>
        </div>
    );

    // 🔴 peek 을 쓰는 뷰(월·시간축·일정)만 받는다 — 년·간트는 일정 카드가 없다. 범위 선택(selection·onSelect)은 모두 받는다.
    const sel = { selection, onSelect: setSelection };
    switch (mode) {
        case 'year': return <YearView value={anchor} onChange={setAnchor} trailing={switcher} {...sel} />;
        case 'week': return <TimeGridView days={7} value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} {...sel} />;
        case '3day': return <TimeGridView days={3} value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} {...sel} />;
        case 'day': return <TimeGridView days={1} value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} {...sel} />;
        case 'list': return <ListView value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} {...sel} />;
        case 'dense': return <TimeGridView days={DENSE_DAYS} value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} {...sel} />;
        case 'gantt': return <GanttView value={anchor} onChange={setAnchor} trailing={switcher} {...sel} />;
        default: return <MonthView value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} {...sel} />;
    }
}
