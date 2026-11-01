/**
 * 시간축 뷰 — 구글 캘린더의 주(7)/3일(3)/하루(1) 보기. **열 개수(days)만 다른 한 컴포넌트**.
 *   쥔님 2026-11-01 17:06: *"주간뷰 3일뷰 하루 스케줄 뷰도 필요하네"*.
 *   🔴 ⛔ 일정 데이터·칸 클릭·드래그·저장 없음(쥔님 *"일정 추가 하지마"*) — 눈금(가로 날짜축 + 세로 시간축)만 그린다.
 *   보고 있는 자리는 범위 시작일(anchor) 하나뿐 — ⛔ 저장 안 함(host.storage 도 안 쓴다).
 *   🔴 색은 토큰 클래스로만(구조 검사 ①) · 날짜 산수는 창틀 부품(배럴)과 한 벌.
 *
 *   trailing: 머리줄 오른쪽 끝에 그대로 그린다 — 메인 세션이 「월·연·주·3일·하루」 전환 단추를 여기 꽂는다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
// 🔑 날짜 계산은 창틀 부품(primitives/date-grid)과 한 벌 — 플러그인 안에 사본을 두지 않는다
import { IconButton, addDays } from '../../../pane-ui-system';
import { dayColumns, rangeStart, rangeLabel, hourLabel, minutesOfDay } from './time-grid';

const WEEK_START = 0;                 // 주 시작 요일 일요일 고정(월 보기와 같다 — 설정으로 뺄 자리)
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const HOURS = 24;                     // 0시~24시
const HOUR_H = 48;                    // 한 시간 = 48px(상수)
const GUTTER = 56;                    // 왼쪽 시간 눈금 열 폭(px)
const START_HOUR = 7;                 // 처음 열 때 맨 위에 오는 시각 — 오전 7시
const MIN_COL = 40;                   // 열 최소 폭 — 좁아도 가로 스크롤 대신 여기서 멈춘다

export function TimeGridView({ days, trailing }: { days: 1 | 3 | 7; trailing?: ReactNode }) {
    const now = new Date();

    // 범위 시작일 — 이 값 하나가 보고 있는 자리다(⛔ 저장 안 함). 늘 「범위의 첫날 자정」으로 정규화해 둔다.
    const [anchor, setAnchor] = useState(() => rangeStart(now, days, WEEK_START));

    // days 가 바뀌면 anchor 는 유지하되 7이면 그 주 시작으로 당긴다(마운트 때도 한 번 정규화 — 멱등)
    useEffect(() => {
        setAnchor((a) => rangeStart(a, days, WEEK_START));
    }, [days]);

    const cols = dayColumns(anchor, days, now);

    // 지금 시각 선 — 하루 중 분(0~1439). 1분마다 갱신, 언마운트에서 해제
    const [nowMin, setNowMin] = useState(() => minutesOfDay(new Date()));
    useEffect(() => {
        const id = setInterval(() => setNowMin(minutesOfDay(new Date())), 60_000);
        return () => clearInterval(id);
    }, []);

    // 처음 열 때 오전 7시가 맨 위에 오게
    const scrollerRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = scrollerRef.current;
        if (el) el.scrollTop = START_HOUR * HOUR_H;
    }, []);

    // ◀ ▶ 는 days 만큼 옮긴다(주=한 주·3일=3일·하루=하루) · 「오늘」은 오늘이 든 범위로
    const go = (dir: number) => setAnchor((a) => addDays(a, dir * days));
    const goToday = () => setAnchor(rangeStart(new Date(), days, WEEK_START));

    const colTemplate = `${GUTTER}px repeat(${days}, minmax(${MIN_COL}px, 1fr))`;
    const hourLines = Array.from({ length: HOURS + 1 }, (_, h) => h);   // 0~24 가로선

    return (
        <div className="h-full flex flex-col bg-bg select-text">
            {/* 머리줄 — 왼쪽 범위 글자 · 오른쪽 이동(◀ 오늘 ▶) + 전환 단추(trailing) */}
            <header className="flex items-center justify-between px-pad py-2 shrink-0 gap-2">
                <div className="text-base font-semibold text-text truncate">{rangeLabel(cols)}</div>
                <div className="flex items-center gap-1 shrink-0">
                    <IconButton icon="left" label="이전" onClick={() => go(-1)} />
                    <button
                        type="button"
                        onClick={goToday}
                        className="px-2 h-btn rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06] transition-colors"
                    >
                        오늘
                    </button>
                    <IconButton icon="right" label="다음" onClick={() => go(1)} />
                    {trailing}
                </div>
            </header>

            {/* 열 머리(고정) — 맨 왼쪽은 시간 눈금 폭만큼 빈 칸 · 각 열은 요일 + 날짜(오늘은 accent 동그라미) */}
            <div
                className="grid shrink-0 border-t border-b border-line overflow-hidden"
                style={{ gridTemplateColumns: colTemplate }}
            >
                <div aria-hidden="true" />
                {cols.map((c) => (
                    <div key={c.iso} className="flex flex-col items-center gap-0.5 py-1 border-l border-line select-none">
                        <span className="text-[11px] text-muted">{WEEKDAYS[c.weekday]}</span>
                        {c.isToday ? (
                            <span className="grid place-items-center min-w-6 h-6 px-1 rounded-full bg-accent text-bg text-[13px] font-semibold tabular-nums">
                                {c.d}
                            </span>
                        ) : (
                            <span className="leading-6 text-[13px] text-text tabular-nums">{c.d}</span>
                        )}
                    </div>
                ))}
            </div>

            {/* 본문 — 세로 스크롤. 0시~24시, 한 시간 48px. ⛔ 가로 스크롤 없음(좁으면 열이 MIN_COL 에서 멈춘다) */}
            <div
                ref={scrollerRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
            >
                <div className="relative" style={{ height: HOURS * HOUR_H }}>
                    {/* 시간마다 가로선 — 눈금 열을 지나 전체 폭. 30분 점선 없음(단순하게) */}
                    {hourLines.map((h) => (
                        <div
                            key={h}
                            className="absolute left-0 right-0 border-t border-line"
                            style={{ top: h * HOUR_H }}
                        />
                    ))}
                    {/* 시 눈금 글자 — 줄 경계에 걸쳐 작게. 0시·24시는 생략 */}
                    {hourLines.filter((h) => h > 0 && h < 24).map((h) => (
                        <span
                            key={h}
                            className="absolute left-1 -translate-y-1/2 text-[11px] text-muted tabular-nums select-none"
                            style={{ top: h * HOUR_H }}
                        >
                            {hourLabel(h)}
                        </span>
                    ))}
                    {/* 날짜 열들 — 눈금 폭만큼 밀고, 열 사이 세로선 */}
                    <div
                        className="absolute top-0 bottom-0 right-0 grid"
                        style={{ left: GUTTER, gridTemplateColumns: `repeat(${days}, minmax(${MIN_COL}px, 1fr))` }}
                    >
                        {cols.map((c) => (
                            <div key={c.iso} className="relative border-l border-line">
                                {/* 지금 시각 선 — 오늘 열에만. 오늘이 범위에 없으면 아무 열도 안 그린다 */}
                                {c.isToday && (
                                    <div
                                        className="absolute left-0 right-0 z-10 pointer-events-none"
                                        style={{ top: nowMin * (HOUR_H / 60) }}
                                    >
                                        <div className="h-0.5 bg-accent" />
                                        <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
