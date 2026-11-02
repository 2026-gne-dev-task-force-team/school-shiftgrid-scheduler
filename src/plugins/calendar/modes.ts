/**
 * 달력 탭 모드 목록 — 큰 단위부터 작은 단위로. 쥔님 2026-11-01 22:17: *"년 분기 월 주 3일 하루 일정 간트 이렇게 하지"*.
 *   「분기」(dense)·「간트」(gantt)는 설정 토글(기본 꺼짐)이라 꺼져 있으면 순서에서 걸러 빠진다.
 *   「일정」(list)은 2026-11-02 들였다(일정 자료 생김) — 하루 뒤·간트 앞, 늘 보인다.
 *   🔴 컴포넌트가 아닌 상수라 CalendarTab(뷰)에서 빼 둔다(fast-refresh 경고 회피).
 */
export type Mode = 'year' | 'month' | 'week' | '3day' | 'day' | 'list' | 'dense' | 'gantt';

export interface ModeDef { id: Mode; label: string; opt?: 'dense' | 'gantt'; }

export const ALL_MODES: ModeDef[] = [
    { id: 'year', label: '년' },
    { id: 'dense', label: '분기', opt: 'dense' },
    { id: 'month', label: '월' },
    { id: 'week', label: '주' },
    { id: '3day', label: '3일' },
    { id: 'day', label: '하루' },
    { id: 'list', label: '일정' },
    { id: 'gantt', label: '간트', opt: 'gantt' },
];

/** 토글 무관 전체 순서 — 검사가 이 순서를 지킨다. */
export const MODE_ORDER: Mode[] = ALL_MODES.map((m) => m.id);
