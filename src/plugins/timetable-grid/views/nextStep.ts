/**
 * 시작 화면 「지금 할 일」 한 줄 — 저장소 상태(선생님 명단·시간표 수)로 다음 한 걸음을 글 한 줄로 고른다. 순수 함수.
 *   ⛔ 배지·체크리스트 아님 — 한 줄만. 있는 명령에 맞춰 줄을 뺀다(선생님 명단 꾸러미가 꺼졌으면 그 걸음은 건너뛴다).
 */
export interface NextStepInput {
    /** 선생님 명단 꾸러미가 켜져 있나(명령이 있나) */
    hasStaff: boolean;
    /** 사람이 한 명이라도 든 선생님 명단이 있나 */
    staffFilled: boolean;
    /** 휴지통 밖 시간표 수 */
    sheets: number;
    /** 달력이 켜져 있나 */
    hasCalendar: boolean;
}

export function nextStepLine({ hasStaff, staffFilled, sheets, hasCalendar }: NextStepInput): string {
    if (hasStaff && !staffFilled) return '먼저 선생님 명단을 만드세요.';
    if (sheets === 0) return '이제 시간표를 만드세요. 「새 시간표」를 누르면 빈 표가 열립니다.';
    return hasCalendar ? '시간표가 있습니다. 달력에서 확인해 보세요.' : '시간표를 열어 칸을 채워 보세요.';
}

/** 「지금 할 일」이 가리키는 첫 걸음 — nextStepLine 과 같은 순서. 걸음 목록에 없는 일(시간표 열어 채우기)이면 null. */
export type StepKey = 'staff' | 'make' | 'calendar';
export function nextStepTarget({ hasStaff, staffFilled, sheets, hasCalendar }: NextStepInput): StepKey | null {
    if (hasStaff && !staffFilled) return 'staff';
    if (sheets === 0) return 'make';
    return hasCalendar ? 'calendar' : null;
}
