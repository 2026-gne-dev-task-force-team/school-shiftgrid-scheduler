/**
 * date-grid — 달력 한 달을 42칸(6행×7열)으로 펴는 순수 계산. 🔴 React 0 · 외부 라이브러리 0 · 순수 Date 로만.
 *
 * ⭐ 색·치수를 모른다(그건 조각의 몫). 여기는 「어느 칸에 어느 날이 오나」만 안다.
 *    DatePicker 가 이 표를 그림으로 바꾼다 — 창틀이 달력을 아는 유일한 자리다.
 */

/** 달력 한 칸 — 한 날. inMonth 가 false 면 이웃 달(앞·뒤)에서 넘어온 날이다 */
export interface DayCell {
    y: number;
    /** 1~12 */
    m: number;
    d: number;
    /** 보고 있는 달의 날인가(false 면 이웃 달에서 채운 칸 → 흐리게) */
    inMonth: boolean;
    /** today 인자와 같은 날인가. today 를 안 주면 늘 false(결정적) */
    isToday: boolean;
    /** 'YYYY-MM-DD' */
    iso: string;
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

/** y,m(1~12),d → 'YYYY-MM-DD' */
export function isoOf(y: number, m: number, d: number): string {
    return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** '2026년 11월' */
export function monthLabel(year: number, month: number): string {
    return `${year}년 ${month}월`;
}

/**
 * delta 달 만큼 옮긴 [연, 월] — 12→1·1→12 로 해를 넘긴다.
 *   shiftMonth(2026,12,+1) → [2027,1] · shiftMonth(2026,1,-1) → [2025,12]
 */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
    const idx = year * 12 + (month - 1) + delta;
    return [Math.floor(idx / 12), (idx % 12) + 1];
}

/** 날짜만 남긴 자정(시·분 버림) */
function dayOnly(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** d 에서 n 일 뒤(음수면 앞). 달·해 넘김은 Date 가 한다 */
export function addDays(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** d 가 속한 주의 첫날(자정). weekStart 0=일요일 시작 · 1=월요일 시작 */
export function startOfWeek(d: Date, weekStart: number = 0): Date {
    const back = (d.getDay() - weekStart + 7) % 7;
    return addDays(dayOnly(d), -back);
}

/** 두 주 시작일 사이가 몇 주인가(b − a). 둘 다 startOfWeek 를 거친 값이어야 정수가 나온다 */
export function weeksBetween(a: Date, b: Date): number {
    return Math.round((dayOnly(b).getTime() - dayOnly(a).getTime()) / (7 * 86_400_000));
}

/**
 * 한 주 7칸 — 이어지는 세로 스크롤 달력의 한 줄(쥔님 2026-11-01 17:01 *"스크롤 부드럽게 — 딱딱 끊어지는게 아니라"*).
 *   weekStartDate 는 그 주 첫날. 「보는 달」개념이 없어 inMonth 는 늘 true 다 — 달 경계는 d===1 로 안다.
 */
export function weekRow(weekStartDate: Date, today?: Date): DayCell[] {
    const tY = today?.getFullYear();
    const tM = today ? today.getMonth() + 1 : undefined;
    const tD = today?.getDate();
    const cells: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
        const dt = addDays(weekStartDate, i);
        const y = dt.getFullYear();
        const m = dt.getMonth() + 1;
        const d = dt.getDate();
        cells.push({ y, m, d, inMonth: true, isToday: y === tY && m === tM && d === tD, iso: isoOf(y, m, d) });
    }
    return cells;
}

/**
 * year·month(1~12) 달의 42칸 표. 항상 6행×7열 = 42칸.
 *   weekStart: 0=일요일 시작(기본) · 1=월요일 시작.
 *   today 를 주면 그 날 칸의 isToday 가 true(안 주면 전부 false — 결정적).
 *
 * 앞쪽은 지난 달 꼬리로, 뒤쪽은 다음 달 머리로 채운다 — 늘 꽉 찬 6주 격자다.
 */
export function monthGrid(
    year: number,
    month: number,
    weekStart: number = 0,
    today?: Date,
): DayCell[] {
    // 이 달 1일의 요일(0=일~6=토)과, 격자 시작까지 거슬러 올라갈 앞쪽 이웃 칸 수
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const lead = (firstWeekday - weekStart + 7) % 7;

    const tY = today?.getFullYear();
    const tM = today ? today.getMonth() + 1 : undefined;
    const tD = today?.getDate();

    const cells: DayCell[] = [];
    // 격자 시작 = 이 달 1일에서 lead 만큼 뒤로. Date 가 음수 일자를 지난 달로 알아서 넘긴다.
    for (let i = 0; i < 42; i++) {
        const dt = new Date(year, month - 1, 1 - lead + i);
        const y = dt.getFullYear();
        const m = dt.getMonth() + 1;
        const d = dt.getDate();
        cells.push({
            y, m, d,
            inMonth: y === year && m === month,
            isToday: y === tY && m === tM && d === tD,
            iso: isoOf(y, m, d),
        });
    }
    return cells;
}
