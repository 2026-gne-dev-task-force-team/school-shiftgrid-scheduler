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
import type { PeekHandle } from '../../../pane-ui-system';
import { MonthView } from './MonthView';
import { YearView } from './YearView';
import { TimeGridView } from './TimeGridView';
import { ListView } from './ListView';
import { GanttView } from './GanttView';
import { useOptions } from '../store';
import { ALL_MODES, type Mode } from '../modes';

const DENSE_DAYS = 14;   // 「분기 뷰」 — 2주. 쥔님: 분기 단위로 자르는 게 아니라 주보다 촘촘한 시간축

export function CalendarTab({ peek }: { peek: PeekHandle }) {
    const [mode, setMode] = useState<Mode>('month');
    // 🔴 「보고 있는 날짜」의 단일 진실 — 초기값은 오늘. 각 뷰에 value 로 내리고 onChange 로 받는다(뷰를 바꿔도 유지된다).
    const [anchor, setAnchor] = useState<Date>(() => new Date());
    const opts = useOptions();

    // 순서 배열 하나(ALL_MODES)로 고정하고, 토글이 켜진 것만 거른다 — 끝에 push 하면 순서가 틀어졌다(쥔님 22:17).
    const modes = ALL_MODES.filter((m) => !m.opt || opts[m.opt]);

    // 보고 있던 옵션 보기를 설정에서 끄면 월로 돌아간다
    useEffect(() => {
        if ((mode === 'dense' && !opts.dense) || (mode === 'gantt' && !opts.gantt)) setMode('month');
    }, [mode, opts.dense, opts.gantt]);

    // 전환 단추. (작은 달력 여는 단추는 23:27 쥔님 *"요 버튼은 이제 없어져도 될듯"* — 리본에 있고 기본 오른쪽이라 걷었다)
    const switcher = (
        <>
        <div role="tablist" aria-label="보기 전환" className="flex items-center ml-1 rounded border border-line overflow-hidden">
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
        </>
    );

    // 🔴 peek 을 쓰는 뷰(월·시간축·일정)만 받는다 — 년·간트는 일정 카드가 없다.
    switch (mode) {
        case 'year': return <YearView value={anchor} onChange={setAnchor} trailing={switcher} />;
        case 'week': return <TimeGridView days={7} value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} />;
        case '3day': return <TimeGridView days={3} value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} />;
        case 'day': return <TimeGridView days={1} value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} />;
        case 'list': return <ListView value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} />;
        case 'dense': return <TimeGridView days={DENSE_DAYS} value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} />;
        case 'gantt': return <GanttView value={anchor} onChange={setAnchor} trailing={switcher} />;
        default: return <MonthView value={anchor} onChange={setAnchor} trailing={switcher} peek={peek} />;
    }
}
