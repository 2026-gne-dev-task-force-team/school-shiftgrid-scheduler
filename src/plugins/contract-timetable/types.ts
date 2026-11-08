/**
 *   📌 약속 플러그인 contract-timetable — 내용은 e38940a 그대로(쥔님 검토 전 초안 · 2026-11-08 14:59 「리버트」).
 *      구조만 바꿨다: import 자리(contract-*) · 공용 시각 낱말은 contract-clock · onChange 인라인.
 * 🔴 인터페이스 「timetable」 0.1.0 — **확정** 시간표(누가·언제·어디서·무엇을).
 *   🔑 네 과제가 전부 이걸 읽는다 — 보결(빈 사람 찾기)·특별실(고정 사용)·보조인력(배정·재배정)·편성(결과를 여기 낸다).
 *   ⭐ 두 겹: 기본 주간 시간표(1년 고정 운영) + 날짜별 바뀜(행사·현장체험학습으로 그날만 달라짐).
 *      소비자는 날짜로 물으면(lessonsOn) 두 겹을 합친 결과를 받는다.
 *   ⛔ 편성 중인 후보·초안은 여기 없다 — 그건 시간표 편성 플러그인 안 일이다. 여기는 「공개본」뿐.
 *   소비자: host.modules 로 timetable 모듈을 받는다. ⛔ 값 0.
 */
import type { Weekday, IsoDate } from '../contract-clock/types';
import type { Disposable } from '../../pane-ui-system/plugin';

/** 수업 한 칸(연강이면 span 2). */
export interface Lesson {
    id: string;
    classId: string;
    day: Weekday;
    period: number;
    /** 연속 교시 수(기본 1). 🔴 점심을 넘지 않는다 — 편성 쪽 규칙. */
    span?: number;
    subjectId: string;
    /** 들어가는 사람(roster Person.id). 담임 수업이면 담임, 전담이면 전담, 보조인력이 같이 들어가면 둘 다. */
    personIds: string[];
    roomId?: string;
    /** 담임 수업 · 전담 수업 · 고정 블록(창체·동아리 등). */
    kind: 'homeroom' | 'specialist' | 'fixed';
}

/** 그날만의 바뀜 — 취소한 수업 id + 더한 수업. */
export interface DayOverride {
    date: IsoDate;
    cancel: string[];
    add: Omit<Lesson, 'id' | 'day'>[];
    reason?: string;
}

export interface LessonQuery {
    classId?: string;
    personId?: string;
    roomId?: string;
    day?: Weekday;
    period?: number;
}

export interface Timetable {
    /** 공개본이 있나 — 없으면 소비자는 「시간표 없음」을 보여 준다. */
    published(): { version: number; publishedAt: string } | null;
    /** 기본 주간 시간표에서 고른다. */
    lessons(q?: LessonQuery): readonly Lesson[];
    /** 그날 실제 시간표 = 기본 + 그날 바뀜. day 는 날짜에서 나온다(주말이면 빈 배열). */
    lessonsOn(date: IsoDate, q?: Omit<LessonQuery, 'day'>): readonly Lesson[];
    /** 공개본을 통째로 갈아 끼운다(편성 플러그인만 부른다 — 확정은 사람이 누른 뒤). version 이 하나 오른다. */
    publish(lessons: readonly Omit<Lesson, 'id'>[]): void;
    overrides(from: IsoDate, to: IsoDate): readonly DayOverride[];
    setOverride(o: DayOverride): void;
    clearOverride(date: IsoDate): void;
    onChange(listener: () => void): Disposable;
}
