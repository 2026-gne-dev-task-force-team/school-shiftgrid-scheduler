/**
 * 분 단위 시각 변환 — "HH:mm" ↔ 분. 표의 시간축 전체(시작 시각 + 줄의 길이·틈)가 이 위에 선다.
 * 🔴 모듈 2: 시각은 더 이상 저장하지 않고 늘 파생시킨다(rows.ts 의 rowTimes) — 이 파일은 그 변환만 맡는다.
 */

/** "HH:mm" → 분. 모양이 깨졌으면 0 */
export function toMins(hhmm: string): number {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
}

/** 분 → "HH:mm" (24시를 넘으면 그대로 넘겨서 보여준다 — 줄이 많으면 드러나야 한다) */
export function fromMins(total: number): string {
    const t = Math.max(0, Math.round(total));
    const h = Math.floor(t / 60);
    const m = t % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
