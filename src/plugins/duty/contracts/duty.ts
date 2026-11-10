/**
 * 🔴 약속 「duty」 0.1.0 — 복무(출장·연수·연가…) 순수 셈의 타입(값 0). 제공자는 duty 꾸러미(modules.duty).
 *   화면 0 · 노드 0 — 입력은 줄 값 배열이다. 보결이 「그 시간 누가 학교에 없나」를 이걸로 읽는다.
 */
/** 복무 한 줄 — 칸 값 그대로. 날짜는 'YYYY-MM-DD'(시간이 붙어도 앞 10자만 본다) 또는 date 칸 값({start}). */
export interface DutyRow {
    /** 사람 칸 값 — relation 은 id 배열 또는 id 하나 */
    person?: string | readonly string[] | null;
    kind?: string | null;
    start?: string | { start: string } | null;
    /** 비우면 시작일 하루 */
    end?: string | { start: string } | null;
    allDay?: boolean | null;
    /** 「3-4」「5」「1,3」 — 종일이면 무시 */
    periods?: string | null;
}

export interface Duty {
    version: 1;
    /** 「3-4」→[3,4] · 「5」→[5] · 「1,3」→[1,3] · 잘못된 값은 null */
    parsePeriods(text: string): number[] | null;
    /** 그 날(그 교시)에 빠지는 기록들 */
    absentAt(rows: readonly DutyRow[], date: string, period?: number): DutyRow[];
    /** 그 날(그 교시)에 빠지는 사람 id 집합 */
    absentPeople(rows: readonly DutyRow[], date: string, period?: number): Set<string>;
}
