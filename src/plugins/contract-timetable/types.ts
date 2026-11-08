/**
 * 🔴 약속 「timetable」 0.1 — **확정** 시간표(누가·언제·어디서·무엇을).
 *   🔑 네 과제가 전부 이걸 읽는다 — 보결(빈 사람 찾기)·특별실(고정 사용)·보조인력(배정·재배정)·편성(결과를 여기 낸다).
 *   ⭐ 두 겹: 기본 주간 시간표(1년 고정 운영) + 날짜별 바뀜(행사·현장체험학습). lessonsOn 으로 물으면 합친 결과를 받는다.
 *   ⛔ 편성 중인 후보·초안은 여기 없다 — 그건 시간표 편성 플러그인 안 일이다. 여기는 「공개본」뿐.
 *   🔗 uses: clock(Weekday·IsoDate 를 import 한다). ⛔ 값 0 — 타입만.
 */
import type { Weekday, IsoDate } from '../contract-clock/types';
import type { Disposable } from '../../pane-ui-system/plugin';

/**
 * 수업 한 칸. 🔴 공개본은 **교시당 Lesson 하나**다 — 연강은 교시마다 한 칸씩 둔다(span 없음, 페이블 4).
 *   🔴 kind:'homeroom' 이면 personIds 에 **담임을 넣지 않는다** — 담임은 classId→ClassGroup.homeroomId 로 안다(보조인력만 personIds, 페이블 2).
 *      교시 범위 안인데 이 반에 Lesson 이 없는 칸 = 담임이 하는 수업(별도로 안 적는다).
 */
export interface Lesson {
    id: string;
    classId: string;
    day: Weekday;
    period: number;
    subjectId: string;
    /** 들어가는 사람(roster Person.id) — 🔴 담임 수업이면 **보조인력만**(담임 제외), 전담이면 전담, 보조인력이 같이 들면 추가. */
    personIds: string[];
    roomId?: string;
    /** 담임 수업 · 전담 수업 · 고정 블록(창체·동아리 등). */
    kind: 'homeroom' | 'specialist' | 'fixed';
}

/** 그날만의 바뀜 — 취소한 수업 id + 더한 수업. 🔴 add 의 Lesson 은 **id 필수**(그날 수업도 가리킬 id 가 있어야 한다, 페이블 4). */
export interface DayOverride {
    date: IsoDate;
    cancel: string[];
    add: Omit<Lesson, 'day'>[];
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
    /** 공개본이 있나 — 🔴 학기(term)까지 낸다(페이블 4). 없으면 소비자는 「시간표 없음」을 보여 준다. */
    published(): { version: number; publishedAt: string; term: string } | null;
    /** 기본 주간 시간표에서 고른다. */
    lessons(q?: LessonQuery): readonly Lesson[];
    /** 그날 실제 시간표 = 기본 + 그날 바뀜. day 는 날짜에서 나온다(주말이면 빈 배열). */
    lessonsOn(date: IsoDate, q?: Omit<LessonQuery, 'day'>): readonly Lesson[];
    /**
     * 공개본을 통째로 갈아 끼운다 + 학기(term)를 단다. version 이 하나 오른다.
     *   🔴 호출자 = **시간표 편성 플러그인**, 또는 timetable 제공자의 직접 입력·엑셀 가져오기다 — **확정은 사람이 누른 뒤**다(페이블 3).
     */
    publish(lessons: readonly Omit<Lesson, 'id'>[], term: string): void;
    overrides(from: IsoDate, to: IsoDate): readonly DayOverride[];
    setOverride(o: DayOverride): void;
    clearOverride(date: IsoDate): void;
    /** 🔴 바뀜 알림 — 제공자는 「호출자별 팩토리(__perCaller)」로 내 구독을 소비자 scope 에 모은다(detach 때 회수). */
    onChange(listener: () => void): Disposable;
}
