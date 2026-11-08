/**
 * 🔴 약속 「absence」 0.1 — 복무·부재(출장·연수·병가) + 고정 일정(회의·원어민 출강).
 *   보결은 「누가 빠졌나 → 그 수업에 누가 들어갈 수 있나」에, 보조인력은 근무 확인에 쓴다.
 *   ⭐ 종일 부재면 하루 전체가 빠진다(보결 제외 사유 ④) · 회의는 사유가 그대로 보인다(⑤).
 *   🔗 uses: clock(Weekday·IsoDate·TimeRange 를 import 한다). ⛔ 값 0 — 타입만. 소비자는 host.modules 로 absence 모듈을 받는다.
 */
import type { Weekday, IsoDate, TimeRange } from '../contract-clock/types';
import type { Disposable } from '../../pane-ui-system/plugin';

export type AbsenceKind = 'trip' | 'training' | 'sick' | 'leave' | 'meeting' | 'other';

/**
 * 부재 한 건. 🔴 빠지는 때는 **시각(range)으로만** 적는다 — 교시는 전담·강사에게 학년이 안 정해져 정의 불가다(페이블 1, 옛 periods 삭제).
 *   ⭐ 한 번(date) 또는 **매주 반복**(weekday + from/to 기간) 둘 다 쓴다 — 부장회의·원어민 출강처럼 매주 같은 요일에 빠지는 것(페이블 1).
 *   종일(allDay)이면 range·weekday 무시하고 그날(또는 그 요일) 하루 전체.
 */
export interface AbsenceEntry {
    id: string;
    personId: string;
    /** 한 번만 빠지는 날(매주 반복이면 비우고 weekday 를 쓴다). */
    date?: IsoDate;
    /** 🔴 매주 반복 — 이 요일마다 빠진다(부장회의·원어민 출강). from/to 로 기간을 한정한다. */
    weekday?: Weekday;
    /** 반복 기간 시작(포함) — 없으면 제한 없음. */
    from?: IsoDate;
    /** 반복 기간 끝(포함) — 없으면 제한 없음. */
    to?: IsoDate;
    /** 종일이면 range 무시, 하루 전체가 빠진다. */
    allDay: boolean;
    /** 빠지는 시각(회의 15:00–16:00). 종일이 아니면 이걸 쓴다. */
    range?: TimeRange;
    kind: AbsenceKind;
    /** 사람이 읽는 사유 — 보결 후보 제외 사유로 그대로 보인다. */
    note?: string;
}

export interface Absence {
    list(from: IsoDate, to: IsoDate, personId?: string): readonly AbsenceEntry[];
    /** 🔴 그날 걸리는 부재 전부 — 매주 반복(weekday+기간)을 그 날짜로 **펼쳐서** 돌려준다(페이블 1). */
    on(date: IsoDate): readonly AbsenceEntry[];
    /** 그 시각에 그 사람이 빠져 있나 — 걸린 항목을 돌려준다(사유를 보여 주려고). */
    blocking(personId: string, date: IsoDate, at: TimeRange): AbsenceEntry | null;
    put(entry: Omit<AbsenceEntry, 'id'> & { id?: string }): string;
    remove(id: string): void;
    /** 🔴 바뀜 알림 — 제공자는 「호출자별 팩토리(__perCaller)」로 내 구독을 소비자 scope 에 모은다(detach 때 회수). */
    onChange(listener: () => void): Disposable;
}
