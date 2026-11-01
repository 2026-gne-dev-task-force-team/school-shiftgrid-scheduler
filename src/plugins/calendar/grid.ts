/**
 * 월 그리드 계산 — 🔴 순수 함수, React 0줄 · 외부 라이브러리 0(순수 Date 로만. date-fns 안 깐다).
 *   구글 캘린더처럼 「앞뒤 이웃 달까지 채운 6행×7열=42칸」을 만든다.
 *
 * ⭐ 여기는 「무슨 날이 어느 칸에 오나」만 안다 — 색·그림은 views/MonthView.tsx 가 그린다(층 분리).
 */

/** 그리드 한 칸 — 이웃 달 날짜도 담는다(inMonth 로 가른다). */
export interface DayCell {
    y: number;        // 그 칸의 실제 연도(이웃 달이면 옆 해일 수 있다)
    m: number;        // 1~12
    d: number;        // 1~31
    inMonth: boolean; // 보고 있는 달의 날인가(false 면 앞/뒤 이웃 달)
    isToday: boolean; // today 인자와 같은 날인가
    iso: string;      // 'YYYY-MM-DD'
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' — 로컬 날짜 기준(UTC 변환 안 함, 날짜가 밀리지 않게). */
export function toISO(y: number, m: number, d: number): string {
    return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * 한 달의 42칸(6행×7열) — 항상 42칸이다(짧은 달도 뒤 이웃 달로 채운다).
 * @param month    1~12
 * @param weekStart 0=일요일. 🔑 지금은 일요일 고정으로만 부른다 — 주 시작 요일을 설정으로 뺄 때 이 인자를 연다.
 * @param today     「오늘」 판정 기준. 생략하면 실제 지금(실시간 오늘 표시).
 */
export function monthGrid(year: number, month: number, weekStart = 0, today: Date = new Date()): DayCell[] {
    const first = new Date(year, month - 1, 1);
    // 첫 칸이 몇 칸 앞 이웃 달로 시작하나(월 1일의 요일 − 주 시작 요일)
    const offset = (first.getDay() - weekStart + 7) % 7;

    const ty = today.getFullYear();
    const tm = today.getMonth() + 1;
    const td = today.getDate();

    const cells: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
        // 🔴 매 칸을 「1일 − offset + i」로 새로 만든다 — Date 가 달·해 넘김을 알아서 정규화한다(DST 영향 없음).
        const dt = new Date(year, month - 1, 1 - offset + i);
        const y = dt.getFullYear();
        const m = dt.getMonth() + 1;
        const d = dt.getDate();
        cells.push({
            y, m, d,
            inMonth: y === year && m === month,
            isToday: y === ty && m === tm && d === td,
            iso: toISO(y, m, d),
        });
    }
    return cells;
}

/** 달 이동 — 연도 넘김 처리(12→다음 해 1, 1→전 해 12). [연, 월] 을 돌려준다. */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
    const total = year * 12 + (month - 1) + delta;
    const ny = Math.floor(total / 12);
    const nm = ((total % 12) + 12) % 12 + 1;   // 음수 total 도 안전하게 1~12
    return [ny, nm];
}

/** 머리줄에 쓰는 라벨 — '2026년 11월'. */
export function monthLabel(year: number, month: number): string {
    return `${year}년 ${month}월`;
}
