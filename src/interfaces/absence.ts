/**
 * 🔴 인터페이스 「absence」 0.1.0 — 복무·부재(출장·연수·병가) + 고정 일정(회의).
 *   보결은 「누가 빠졌나 → 그 수업에 누가 들어갈 수 있나」에, 보조인력은 근무 확인에 쓴다.
 *   ⭐ 종일 부재면 수업 없는 교시까지 하루 전체가 빠진다(보결 제외 사유 ④) · 회의는 사유가 그대로 보인다(⑤).
 *   소비자: host.modules.use<Absence>('absence'). ⛔ 값 0.
 */
import type { IsoDate, TimeRange, Subscribe } from './common';

export type AbsenceKind = 'trip' | 'training' | 'sick' | 'leave' | 'meeting' | 'other';

export interface AbsenceEntry {
    id: string;
    personId: string;
    date: IsoDate;
    /** 종일이면 periods·range 무시. */
    allDay: boolean;
    /** 빠지는 교시(그 사람 담당 학년 기준) — 교시로 적은 경우. */
    periods?: number[];
    /** 빠지는 시각 — 시각으로 적은 경우(회의 15:00–16:00). 교시와 시각 중 하나만. */
    range?: TimeRange;
    kind: AbsenceKind;
    /** 사람이 읽는 사유 — 보결 후보 제외 사유로 그대로 보인다. */
    note?: string;
}

export interface Absence {
    list(from: IsoDate, to: IsoDate, personId?: string): readonly AbsenceEntry[];
    on(date: IsoDate): readonly AbsenceEntry[];
    /** 그 시각에 그 사람이 빠져 있나 — 걸린 항목을 돌려준다(사유를 보여 주려고). */
    blocking(personId: string, date: IsoDate, at: TimeRange): AbsenceEntry | null;
    put(entry: Omit<AbsenceEntry, 'id'> & { id?: string }): string;
    remove(id: string): void;
    onChange: Subscribe;
}
