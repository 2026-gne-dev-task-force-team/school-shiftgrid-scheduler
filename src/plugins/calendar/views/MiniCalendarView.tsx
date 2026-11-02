/**
 * 작은 달력 — 사이드 패널용 작은 달력 하나(쥔님 2026-11-01 17:03 *"미니 캘린더 뷰도 패널용으로 하나 만들어줘 — 그것도 캘린더 뷰 플러그인 안에"*).
 *   ⭐ 그림은 창틀 부품 DatePicker 그대로 쓴다 — 달력 격자를 플러그인 안에 또 그리지 않는다(날짜 계산도 부품과 한 벌).
 *   🔴 ⛔ 일정 없음. 날짜를 누르면 그 칸이 표시될 뿐이다(해가 없는 동작).
 *   🔑 갈아끼울 자리: onChange 가 월 보기(calendar.month)를 그 달로 스크롤시키는 연동 — 「표 간 연동」은 🙋 쥔님 판정 대기라 아직 안 잇는다.
 */
import { useState } from 'react';
import { DatePicker } from '../../../pane-ui-system';

export function MiniCalendarView() {
    const [picked, setPicked] = useState<string | null>(null);
    return (
        <div className="h-full overflow-y-auto bg-bg p-2">
            <DatePicker value={picked} onChange={setPicked} />
        </div>
    );
}
