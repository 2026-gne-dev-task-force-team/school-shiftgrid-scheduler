/**
 * 캘린더 탭 — 구글 캘린더처럼 **탭 하나 안에서 월·연·주·3일·하루를 단추로 전환**한다(쥔님 2026-11-01 17:06
 *   *"연간 뷰 필요하네 … 주간뷰 3일뷰 하루 스케줄 뷰도 필요하네"* — 탭 다섯이 아니라 한 탭의 다섯 모습).
 *   각 뷰는 머리줄 오른쪽 끝 `trailing` 자리에 이 전환 단추를 그대로 그린다.
 *   🔴 ⛔ 일정 없음 — 전부 눈금뿐이다. 어느 모습을 보고 있었나는 ⛔ 저장 안 함.
 */
import { useState } from 'react';
import { MonthView } from './MonthView';
import { YearView } from './YearView';
import { TimeGridView } from './TimeGridView';

type Mode = 'month' | 'year' | 'week' | '3day' | 'day';
const MODES: { id: Mode; label: string }[] = [
    { id: 'month', label: '월' },
    { id: 'year', label: '연' },
    { id: 'week', label: '주' },
    { id: '3day', label: '3일' },
    { id: 'day', label: '하루' },
];

export function CalendarTab() {
    const [mode, setMode] = useState<Mode>('month');

    const switcher = (
        <div role="tablist" aria-label="보기 전환" className="flex items-center ml-1 rounded border border-line overflow-hidden">
            {MODES.map((m) => (
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
    );

    switch (mode) {
        case 'year': return <YearView trailing={switcher} />;
        case 'week': return <TimeGridView days={7} trailing={switcher} />;
        case '3day': return <TimeGridView days={3} trailing={switcher} />;
        case 'day': return <TimeGridView days={1} trailing={switcher} />;
        default: return <MonthView trailing={switcher} />;
    }
}
