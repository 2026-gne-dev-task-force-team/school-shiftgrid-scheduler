/**
 * 달력 탭 모드 목록 — 큰 단위부터 작은 단위로. 쥔님 2026-11-01 22:17: *"년 분기 월 주 3일 하루 일정 간트 이렇게 하지"*.
 *   🔴 2026-11-08 쥔님: *"연간뷰, 월간뷰, 주간뷰, 일정뷰만 남기고 다 비활성화해라. 그건 시험적 기능이라서,
 *      선생님들 보면 당황할거 같거든"* — 년·월·주·일정 넷만 기본에 보인다. 나머지(분기·3일·하루·간트)는
 *      `experimental: true` 로 접고, 설정 「시험 기능 보기」(기본 꺼짐)를 켜야 순서에 다시 낀다. ⛔ 코드 삭제 아님 — 비활성화다.
 *   「일정」(list)은 2026-11-02 들였다(일정 자료 생김) — 하루 뒤·간트 앞.
 *   🔴 컴포넌트가 아닌 상수라 CalendarTab(뷰)에서 빼 둔다(fast-refresh 경고 회피).
 */
export type Mode = 'year' | 'month' | 'week' | '3day' | 'day' | 'list' | 'dense' | 'gantt';

export interface ModeDef { id: Mode; label: string; experimental?: boolean; }

export const ALL_MODES: ModeDef[] = [
    { id: 'year', label: '년' },
    { id: 'dense', label: '분기', experimental: true },
    { id: 'month', label: '월' },
    { id: 'week', label: '주' },
    { id: '3day', label: '3일', experimental: true },
    { id: 'day', label: '하루', experimental: true },
    { id: 'list', label: '일정' },
    { id: 'gantt', label: '간트', experimental: true },
];

/** 토글 무관 전체 순서 — 검사가 이 순서를 지킨다. */
export const MODE_ORDER: Mode[] = ALL_MODES.map((m) => m.id);

/** 지금 보일 모드들 — experimental 은 「시험 기능 보기」가 켜졌을 때만 낀다(순서는 ALL_MODES 그대로). */
export function visibleModes(experimental: boolean): ModeDef[] {
    return ALL_MODES.filter((m) => !m.experimental || experimental);
}

/**
 * 저장돼 있던(또는 지금 고른) 모드가 지금 보이지 않으면 '월'로 되돌린다.
 *   🔴 시험 기능을 껐는데 보던 게 시험 모드(분기·3일·하루·간트)였으면 월로 — 선생님이 빈 화면에 안 갇히게(쥔님 2026-11-08).
 */
export function resolveMode(saved: Mode, experimental: boolean): Mode {
    return visibleModes(experimental).some((m) => m.id === saved) ? saved : 'month';
}
