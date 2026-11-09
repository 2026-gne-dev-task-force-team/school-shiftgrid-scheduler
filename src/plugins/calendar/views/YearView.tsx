/**
 * 연간 뷰 — 다이어리 수첩의 연간 계획표 그 느낌. **월 보기를 작게 깐 게 아니라** 가로 12달 × 세로 31일 표 하나다.
 *   쥔님 2026-11-01: *"연간 뷰 필요하네, 연간뷰는 월뷰 작게해서 보이는게 아니라. 그 다이어리 수첩처럼 테이블 형식 같은 느낌으로"*.
 *
 *   🔴 ⛔ 일정 데이터·칸 클릭·호버·저장 없음(쥔님: *"일정 추가 하지마"*). 보고 있는 해는 ⛔ 저장 안 함.
 *
 *   📌 21:47 — 보고 있는 날짜를 탭(CalendarTab)이 쥔다. 여긴 제 year useState 를 버리고 value 의 해를 보여주고,
 *      ◀ ▶ 올해로 해를 옮기면 onChange 로 올린다(월·일은 그대로 둬 다른 뷰로 가도 그 달·날이 보존된다).
 *   🔴 색은 토큰 클래스로만(구조 검사 ①) · 얇은 1px 경계선(line) · 토·일은 바탕 한 단(panel2) · 오늘은 accent 바탕.
 *
 *   머리줄은 월 보기와 같은 꼴: 왼쪽 「2026년」 · 오른쪽 「◀ 올해 ▶」. 오른쪽 끝의 trailing 은 메인이 뷰 전환 단추를 꽂는 자리다.
 *   본문은 표 하나로 탭을 꽉 채운다: 31행이 1fr 로 늘고, 탭이 너무 낮으면(행 18px 밑) 세로 스크롤 · 폭 560px 밑이면 가로 스크롤.
 */
import { useMemo, useRef, type ReactNode } from 'react';
// 🔑 날짜 계산은 창틀 부품과 한 벌이다(배럴로만) · 연간표 펴기는 옆 순수 함수(year-table)
import { IconButton } from '../../../pane-ui-system';
import { yearTable, yearLabel } from './year-table';
import { useCalendarData } from '../useEvents';
import { buildDayIndex } from '../events';
import { useRangeSelect, type RangeHit } from './useRangeSelect';
import { daysSelection, dayInSelection, type CalSelection } from '../selection';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function YearView({ value, onChange, trailing, selection, onSelect }: { value: Date; onChange: (d: Date) => void; trailing?: ReactNode; selection: CalSelection; onSelect: (s: CalSelection) => void }) {
    const now = new Date();
    const year = value.getFullYear();                      // 🔴 제 state 없음 — 탭의 anchor 가 진실
    const table = yearTable(year, now);   // cells[m-1][d-1]
    // 일정 있는 날에 점 하나(개수 아님) — subscribe 변경 때만 색인을 다시 짓는다
    const { events } = useCalendarData();
    const dayIndex = useMemo(() => buildDayIndex(events), [events]);
    // 해만 바꾸고 월·일은 그대로 올린다(다른 뷰로 가도 그 달·날이 보존된다)
    const goYear = (y: number) => onChange(new Date(y, value.getMonth(), value.getDate()));

    // 범위 선택 — 날 칸을 죽 끌어 날짜 범위를 고른다(없는 날 2/30 칸은 data-day 가 없어 저절로 건너뛴다).
    const selAnchor = useRef<string | null>(null);
    const resolveDay = (x: number, y: number): RangeHit<string> => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!el) return { value: null, onEvent: false };
        return { value: el.closest('[data-day]')?.getAttribute('data-day') ?? null, onEvent: false };
    };
    const range = useRangeSelect<string>({
        resolve: resolveDay,
        onSet: (iso, shift) => {
            if (shift) {
                const a = selAnchor.current ?? (selection?.kind === 'days' ? selection.from : iso);
                selAnchor.current = a;
                onSelect(daysSelection(a, iso));
            } else {
                selAnchor.current = iso;
                onSelect(daysSelection(iso, iso));
            }
        },
        onExtend: (iso) => onSelect(daysSelection(selAnchor.current ?? iso, iso)),
    });

    return (
        <div className="h-full flex flex-col bg-bg">
            {/* 머리줄 — 왼쪽 연도 · 오른쪽 이동(◀ 올해 ▶) + 뷰 전환(trailing). 월 보기와 같은 높이·여백 */}
            <header className="flex items-center justify-between px-pad py-2 shrink-0">
                <span className="text-base font-semibold text-text tabular-nums">{yearLabel(year)}</span>
                <div className="flex items-center gap-1">
                    <IconButton icon="left" label="지난 해" onClick={() => goYear(year - 1)} />
                    <button
                        type="button"
                        onClick={() => goYear(now.getFullYear())}
                        className="px-2 h-btn rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06] transition-colors"
                    >
                        올해
                    </button>
                    <IconButton icon="right" label="다음 해" onClick={() => goYear(year + 1)} />
                    {trailing}
                </div>
            </header>

            {/* 본문 — 표 하나. 가로·세로 둘 다 필요하면 스크롤(폭 560px·행 18px 바닥) */}
            <div className="flex-1 min-h-0 overflow-auto overscroll-contain" {...range.bind}>
                <div
                    className="grid min-h-full min-w-[560px] border-t border-l border-line"
                    style={{
                        gridTemplateColumns: '2.25rem repeat(12, minmax(0, 1fr))',
                        gridTemplateRows: 'auto repeat(31, minmax(18px, 1fr))',
                    }}
                >
                    {/* 머리줄 — 왼쪽 위 빈 모서리 + 1월…12월 (스크롤해도 위에 붙어 있다) */}
                    <div className="sticky top-0 left-0 z-20 border-r border-b border-line bg-panel" />
                    {MONTHS.map((m) => (
                        <div
                            key={`h${m}`}
                            className="sticky top-0 z-10 border-r border-b border-line bg-panel py-1 text-center text-[11px] font-medium text-muted select-none"
                        >
                            {m}월
                        </div>
                    ))}

                    {/* 날짜 줄 — 첫 칸은 일(日) 숫자 머리(왼쪽에 붙어 있다), 그 다음 12달 칸 */}
                    {DAYS.map((d) => (
                        <div key={`r${d}`} className="contents">
                            <div className="sticky left-0 z-10 border-r border-b border-line bg-panel grid place-items-center text-[10px] tabular-nums text-muted select-none">
                                {d}
                            </div>
                            {MONTHS.map((m) => {
                                const c = table[m - 1][d - 1];
                                if (!c) {
                                    // 없는 날 — 빈 칸(경계선은 유지)
                                    return <div key={m} className="border-r border-b border-line" />;
                                }
                                const weekend = c.weekday === 0 || c.weekday === 6;
                                const hasEvent = dayIndex.has(c.iso);
                                const selected = dayInSelection(selection, c.iso);
                                // 오늘은 채운 accent 가 이김 · 아니면 고른 칸은 연한 accent + 안쪽 테두리(토큰만)
                                const bg = c.isToday ? 'bg-accent' : selected ? 'bg-accent/[0.14] ring-1 ring-inset ring-accent' : weekend ? 'bg-panel2' : '';
                                return (
                                    <div
                                        key={m}
                                        data-day={c.iso}
                                        className={`border-r border-b border-line px-1 flex items-center gap-1 overflow-hidden ${bg}`}
                                    >
                                        <span className={`text-[11px] leading-none tabular-nums ${c.isToday ? 'text-bg font-semibold' : 'text-text'}`}>
                                            {c.d}
                                        </span>
                                        <span className={`text-[10px] leading-none ${c.isToday ? 'text-bg' : 'text-muted'}`}>
                                            {WEEKDAYS[c.weekday]}
                                        </span>
                                        {hasEvent && (
                                            <span className={`ml-auto shrink-0 w-1 h-1 rounded-full ${c.isToday ? 'bg-bg' : 'bg-accent'}`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
