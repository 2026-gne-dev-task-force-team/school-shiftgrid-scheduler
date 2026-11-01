/**
 * 캘린더 탭 — 구글 캘린더처럼 **탭 하나 안에서 년·월·주·3일·하루를 단추로 전환**한다(쥔님 2026-11-01 17:06
 *   *"연간 뷰 필요하네 … 주간뷰 3일뷰 하루 스케줄 뷰도 필요하네"* — 탭 다섯이 아니라 한 탭의 다섯 모습).
 *   각 뷰는 머리줄 오른쪽 끝 `trailing` 자리에 이 전환 단추를 그대로 그린다.
 *   17:23 — 설정에서 켜면 「분기」「간트」 단추가 더 붙는다(기본 꺼짐 · store.ts).
 *   🔴 ⛔ 일정 없음 — 전부 눈금뿐이다. 어느 모습을 보고 있었나는 ⛔ 저장 안 함.
 */
import { useEffect, useState } from 'react';
import { IconButton } from '../../../pane-ui-system';
import { MonthView } from './MonthView';
import { YearView } from './YearView';
import { TimeGridView } from './TimeGridView';
import { GanttView } from './GanttView';
import { useOptions } from '../store';

type Mode = 'year' | 'month' | 'week' | '3day' | 'day' | 'dense' | 'gantt';

// 순서는 큰 단위부터 — 쥔님 17:18 *"년월 이런 식이어야 하지 않겠니?"* (「연」이 아니라 「년」, 년 → 월 → 주 → 3일 → 하루)
const BASE_MODES: { id: Mode; label: string }[] = [
    { id: 'year', label: '년' },
    { id: 'month', label: '월' },
    { id: 'week', label: '주' },
    { id: '3day', label: '3일' },
    { id: 'day', label: '하루' },
];
const DENSE_DAYS = 14;   // 「분기 뷰」 — 2주. 쥔님: 분기 단위로 자르는 게 아니라 주보다 촘촘한 시간축

export function CalendarTab({ openMini }: { openMini?: () => void }) {
    const [mode, setMode] = useState<Mode>('month');
    const opts = useOptions();

    const modes = [...BASE_MODES];
    if (opts.dense) modes.push({ id: 'dense', label: '분기' });
    if (opts.gantt) modes.push({ id: 'gantt', label: '간트' });

    // 보고 있던 옵션 보기를 설정에서 끄면 월로 돌아간다
    useEffect(() => {
        if ((mode === 'dense' && !opts.dense) || (mode === 'gantt' && !opts.gantt)) setMode('month');
    }, [mode, opts.dense, opts.gantt]);

    // 전환 단추 + 미니 캘린더(왼쪽 패널) 여는 단추 — 17:27 쥔님 *"미니 캘린더 뷰 패널은 어디갔냐"* (명령 팔레트에만 있어 안 보였다)
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
        {openMini && <IconButton icon="panelLeft" label="미니 캘린더 — 왼쪽 패널에 열기" onClick={openMini} />}
        </>
    );

    switch (mode) {
        case 'year': return <YearView trailing={switcher} />;
        case 'week': return <TimeGridView days={7} trailing={switcher} />;
        case '3day': return <TimeGridView days={3} trailing={switcher} />;
        case 'day': return <TimeGridView days={1} trailing={switcher} />;
        case 'dense': return <TimeGridView days={DENSE_DAYS} trailing={switcher} />;
        case 'gantt': return <GanttView trailing={switcher} />;
        default: return <MonthView trailing={switcher} />;
    }
}
