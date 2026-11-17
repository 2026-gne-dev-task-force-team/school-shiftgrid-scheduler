/**
 * 🔴 약속 「clock」 0.1.0 — 일과표 순수 셈의 타입(값 0). 학년마다 점심이 달라 같은 「N교시」가 학년마다 다른 시각인 문제를 푼다.
 *   소비자(보결·시간표 편성)는 host.modules.use<Clock>('clock') 로 받는다. 충돌 판정은 교시 번호가 아니라 **실제 시각**으로 한다.
 */
import type { CMD } from './commands';

/** 일과표 한 줄의 값 — 화면 칸 값에서 rowOf 가 만든다. */
export interface SlotRow {
    kind?: string;                 // class · break · lunch · assembly · dismissal
    period?: number | null;        // 수업 칸만 — 학년 안에서의 교시 번호
    start?: string;                // HH:MM
    end?: string;                  // HH:MM (하교는 비워도 된다)
    grades?: string[];             // '1'~'6' — 비우면 전 학년
}

export interface TimeRange { start: string; end: string }
export interface PeriodRef { grade: number; period: number }
/** 수업 한 칸의 실제 시각 — slotsFor 가 돌려준다. */
export interface ClassSlot { period: number; start: string; end: string }
export interface RowProblem { index: number; reason: string }

export interface Clock {
    version: 1;
    /** 명령 id 상수 — host.commands.run(<약속>.cmd.open). */
    readonly cmd: Readonly<Record<keyof typeof CMD, string>>;
    /** 그 학년에 해당하는(잘못된 줄은 뺀) 칸을 시작 시각순으로. */
    slotsForGrade(rows: readonly SlotRow[], grade: number): SlotRow[];
    /** 그 학년 N교시의 실제 시각 — 없으면 null. */
    timeOf(rows: readonly SlotRow[], grade: number, period: number): TimeRange | null;
    /** 두 (학년·교시)의 실제 시각이 겹치나 — 맞닿기만 하면 안 겹침, 시각을 모르면 false. */
    overlaps(rows: readonly SlotRow[], a: PeriodRef, b: PeriodRef): boolean;
    lunchOf(rows: readonly SlotRow[], grade: number): TimeRange | null;
    /** 하교 시각(HH:MM) — 없으면 null. */
    dismissalOf(rows: readonly SlotRow[], grade: number): string | null;
    /** 잘못된 줄(25:00 · 끝<시작 · 시작 없음 …)과 이유. */
    checkRows(rows: readonly SlotRow[]): RowProblem[];
    /**
     * 지금 적혀 있는 일과표에서 그 학년의 수업 칸 시각 — 교시 순. 일과표를 읽을 수 없거나(꺼짐·비었음) 그 학년 칸이 없으면 [].
     *   (위 함수들은 줄을 인자로 받지만 이건 일과표 쪽이 스스로 읽는다 — 소비자가 일과표를 복사해 두지 않게.)
     */
    slotsFor(grade: number): ClassSlot[];
    /** 일과표가 바뀔 때 부른다. 끄는 함수를 돌려준다. */
    subscribe(fn: () => void): () => void;
}
