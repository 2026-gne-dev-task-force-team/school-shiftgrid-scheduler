/**
 * 줄의 파생 시각 · 표시 라벨 — 격자를 그리는 쪽은 이 두 함수만 알면 된다.
 * 🔴 시각은 저장하지 않는다 — startTime + 누적(minutes+gapAfter)에서 매번 다시 구한다(설계 「모델」).
 */
import type { Row } from './model';
import { toMins, fromMins } from './time';

export interface RowTime { start: string; end: string }

/** 줄마다 "HH:mm~HH:mm" 을 구성할 시작·끝 — 시간축의 유일한 진실(derivation) */
export function rowTimes(startTime: string, rows: Row[]): RowTime[] {
    let mins = toMins(startTime);
    const out: RowTime[] = [];
    for (const r of rows) {
        const start = mins;
        const end = mins + Math.max(0, r.minutes);
        out.push({ start: fromMins(start), end: fromMins(end) });
        mins = end + Math.max(0, r.gapAfter || 0);
    }
    return out;
}

/**
 * 줄 머리에 보일 글자 — 손으로 붙인 라벨이 있으면 그 글자(점심 등),
 * 없으면 수업 넣을 수 있는 줄만 세어 자동 번호. 수업 못 넣는 줄에 라벨이 없으면 빈 글자.
 */
export function rowDisplayLabel(rows: Row[], index: number): string {
    const r = rows[index];
    if (!r) return '';
    if (r.label && r.label.trim()) return r.label;
    if (!r.assignable) return '';
    let n = 0;
    for (let i = 0; i <= index; i++) if (rows[i].assignable) n += 1;
    return String(n);
}
