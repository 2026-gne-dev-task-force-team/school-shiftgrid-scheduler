/**
 * 달력 날짜 글자 — 1일은 「12월 1일」, 좁은 화면(< 860px, 창틀 NARROW_PX)은 짧은 꼴 「12/1」(칸이 좁아 줄바꿈되던 것 · R6-S14).
 *   ⛔ 줄바꿈 금지(whitespace-nowrap). CSS 로만 가른다 — 칸마다 matchMedia 를 구독하지 않는다(월 보기는 칸이 수백 개).
 */
export function DayLabel({ month, day }: { month: number; day: number }) {
    if (day !== 1) return <span className="whitespace-nowrap">{day}</span>;
    return (
        <span className="whitespace-nowrap">
            <span className="max-[859px]:hidden">{month}월 {day}일</span>
            <span className="hidden max-[859px]:inline">{month}/{day}</span>
        </span>
    );
}
