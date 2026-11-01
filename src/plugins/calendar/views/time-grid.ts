/**
 * time-grid — 시간축 뷰(주/3일/하루)의 순수 계산. 🔴 React 0 · 외부 라이브러리 0 · 순수 Date 로만.
 *   쥔님 2026-11-01 17:06: *"주간뷰 3일뷰 하루 스케줄 뷰도 필요하네"* — 구글 캘린더의 가로 날짜축 + 세로 시간축.
 *   ⛔ 일정 데이터·클릭·저장 없음(쥔님 *"일정 추가 하지마"*) — 여기는 「어느 날이 어느 열에 오나 · 몇 시 눈금인가」만 안다.
 *
 * ⭐ 날짜 계산의 바닥은 창틀 부품(primitives/date-grid)과 한 벌이다 — 사본을 두지 않고 배럴에서 가져다 쓴다.
 *    열 개수(days)만 다를 뿐 월 보기와 같은 날짜 산수를 쓴다.
 */
import { addDays, startOfWeek, isoOf } from '../../../pane-ui-system';

/** 요일 한 글자 — 0=일 ~ 6=토. rangeLabel 의 하루 꼴 '(수)' 과 열 머리가 같이 쓴다 */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 시간축의 한 열 — 하루. date-grid 의 DayCell 과 달리 weekday(요일 숫자)를 들고 inMonth 개념이 없다 */
export interface DayColumn {
    y: number;
    /** 1~12 */
    m: number;
    d: number;
    /** 0=일 ~ 6=토 */
    weekday: number;
    /** today 인자와 같은 날인가. today 를 안 주면 늘 false(결정적) */
    isToday: boolean;
    /** 'YYYY-MM-DD' */
    iso: string;
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

/**
 * start 부터 days 일치의 열 — length === days. 달·해 넘김은 addDays 가 한다.
 *   today 를 주면 그 날 열의 isToday 가 true(안 주면 전부 false — 결정적).
 */
export function dayColumns(start: Date, days: number, today?: Date): DayColumn[] {
    const tY = today?.getFullYear();
    const tM = today ? today.getMonth() + 1 : undefined;
    const tD = today?.getDate();
    const cols: DayColumn[] = [];
    for (let i = 0; i < days; i++) {
        const dt = addDays(start, i);
        const y = dt.getFullYear();
        const m = dt.getMonth() + 1;
        const d = dt.getDate();
        cols.push({
            y, m, d,
            weekday: dt.getDay(),
            isToday: y === tY && m === tM && d === tD,
            iso: isoOf(y, m, d),
        });
    }
    return cols;
}

/**
 * anchor 가 든 범위의 첫날(자정) — 주(7)는 그 주 시작으로 당기고(startOfWeek), 3·1 은 anchor 그날 자정.
 *   ⭐ addDays(anchor, 0) 이 「시·분 버린 자정」을 돌려준다(date-grid 와 같은 바닥).
 */
export function rangeStart(anchor: Date, days: 1 | 3 | 7, weekStart = 0): Date {
    return days === 7 ? startOfWeek(anchor, weekStart) : addDays(anchor, 0);
}

/**
 * 머리줄 범위 글자 — cols(dayColumns 결과)를 받아 구글 캘린더 꼴로.
 *   하루            '2026년 11월 4일 (수)'
 *   같은 달 여러 날  '2026년 11월 1일 – 7일'
 *   달 걸침          '2026년 11월 29일 – 12월 5일'
 *   해 걸침          '2026년 12월 28일 – 2027년 1월 3일'
 */
export function rangeLabel(cols: DayColumn[]): string {
    const a = cols[0];
    const b = cols[cols.length - 1];
    if (cols.length === 1) {
        return `${a.y}년 ${a.m}월 ${a.d}일 (${WEEKDAYS[a.weekday]})`;
    }
    const head = `${a.y}년 ${a.m}월 ${a.d}일`;
    if (a.y !== b.y) return `${head} – ${b.y}년 ${b.m}월 ${b.d}일`;   // 해 걸침
    if (a.m !== b.m) return `${head} – ${b.m}월 ${b.d}일`;            // 달 걸침
    return `${head} – ${b.d}일`;                                      // 같은 달
}

/** 시 눈금 글자 — '09:00' 꼴(24시간, 0 채움) */
export function hourLabel(h: number): string {
    return `${pad2(h)}:00`;
}

/** 하루 중 분(0~1439) — 지금 시각 선을 어느 높이에 그을지 */
export function minutesOfDay(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
}

/** 두 날 사이 일수(b − a), 자정 기준. 좌우로 이어지는 날 스크롤이 「오늘에서 몇 날 떨어졌나」를 세는 데 쓴다 */
export function daysBetween(a: Date, b: Date): number {
    const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
    return Math.round((b0 - a0) / 86_400_000);
}
