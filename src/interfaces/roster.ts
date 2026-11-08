/**
 * 🔴 인터페이스 「roster」 0.1.0 — 학교의 사람·반·과목·특별실 명부.
 *   네 과제(보결·특별실·보조인력·시간표 편성)가 전부 이걸 읽는다. 소비자는 host.modules.use<Roster>('roster').
 *   ⛔ 값 0 — 타입만. 제공자(M1 roster 레인)가 채운다.
 *
 * ⭐ 낱말 판정
 *   - 담임은 사람의 종류가 아니라 **반의 속성**이다(v0.2 선생님 #3) → ClassGroup.homeroomId
 *   - 복식학급(두 학년 한 반)은 ClassGroup.grades 가 둘 이상인 것 — 1차 범위 밖이지만 표현은 막지 않는다
 *   - 도움반(특수학급)은 ClassGroup.special — 「특정 교시 국어·수학 필수」 같은 제약은 시간표 규칙 쪽 몫
 *   - 보조인력(스포츠강사·원어민·기초학력 전담강사…)은 혼자 수업을 못 한다 → canTeachAlone:false (보결 제외 사유 ①)
 */
import type { Subscribe, ImportReport } from './common';

/** 사람의 종류 — 한 사람이 여럿일 수 있다(담임이면서 영어 교과 등은 'teacher' + 반 속성). */
export type StaffRole =
    | 'teacher'      // 교사(담임·교과)
    | 'specialist'   // 교과전담
    | 'instructor'   // 강사 — 스포츠강사·원어민(수업에 들어가지만 혼자는 못 한다)
    | 'aide'         // 보조인력 — 기초학력 전담강사·한국어 강사·디지털 튜터·자원봉사자
    | 'staff';       // 비교과 교직원(보결 D 등급)

export interface Person {
    id: string;
    /** ⛔ 공개 레포 — 샘플·테스트엔 지어낸 이름만. */
    name: string;
    roles: StaffRole[];
    /** 1 보직(부장) · 2 일반 · 3 지원인력. 🔴 소프트 제약 가중에만 쓴다(하드와 무관). */
    tier?: 1 | 2 | 3;
    /** 혼자 수업할 수 있나 — false 면 보결 후보에서 빠지고, 그 사람만 들어간 교시엔 담임이 붙잡힌다. */
    canTeachAlone: boolean;
    /** 맡을 수 있는 과목(전담·보조인력의 지원 교과). */
    subjectIds: string[];
    /** 학교마다 다른 칸(직무 등) — 키는 자유, 값은 JSON. */
    attr?: Record<string, unknown>;
}

export interface ClassGroup {
    id: string;
    /** 학년 — 단식학급은 하나, 복식학급은 둘 이상. */
    grades: number[];
    /** 같은 학년 안 반 번호(1반=1). 복식이면 학교가 붙인 번호. */
    no: number;
    /** 표시 이름 '3-2' · '복식 1·2' */
    name: string;
    /** 담임 — Person.id. 없으면 미정. */
    homeroomId?: string;
    /** 도움반(특수학급) */
    special?: boolean;
}

export interface Subject {
    id: string;
    name: string;
    short?: string;
}

export interface Room {
    id: string;
    name: string;
    /** 동시 수용 반 수(과학실 2개를 한 방으로 적으면 2). 🔴 같은 과목 방이 둘이면 합산은 소비자가 한다. */
    capacity: number;
    /** 이 방을 쓰는 과목. 비면 예약 전용(도서관·시청각실). */
    subjectIds: string[];
}

/** 명부 한 갈래의 읽기·쓰기 — 넷이 같은 꼴이다. */
export interface Collection<T extends { id: string }> {
    list(): readonly T[];
    get(id: string): T | undefined;
    /** 있으면 바꾸고 없으면 더한다. 돌려준 id 가 진짜 id 다(새 것이면 제공자가 짓는다). */
    put(item: Omit<T, 'id'> & { id?: string }): string;
    remove(id: string): void;
}

/** 엑셀 업로드 자리 — 파일 읽기는 export 인터페이스(readXlsx)가, 행 해석은 roster 가 한다. */
export type RosterSheetKind = 'people' | 'classes' | 'subjects' | 'rooms';

export interface Roster {
    people: Collection<Person>;
    classes: Collection<ClassGroup>;
    subjects: Collection<Subject>;
    rooms: Collection<Room>;
    /** 학년 목록(반이 있는 학년만, 오름차순). */
    grades(): number[];
    /** 첫 줄이 머리글인 표 → 명부. 실패 줄은 skipped 로 돌려준다(⛔ 조용히 버리지 않는다). */
    importRows(kind: RosterSheetKind, rows: readonly (readonly unknown[])[]): ImportReport;
    /** 빈 양식(머리글 한 줄) — 「빈 양식 내려받기」용. */
    template(kind: RosterSheetKind): string[];
    onChange: Subscribe;
}
