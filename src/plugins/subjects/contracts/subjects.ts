/**
 * 🔴 약속 「subjects」 0.1.0 — **과목 목록**의 타입 정의 자리(값 0). 런타임 실체는 제공자 플러그인(subjects) 안에 산다.
 *   ⛔ 시수 계산 같은 기능은 없다. 읽는 칸은 이름·약칭·메모 + 구분(kind) — 색·특별실은 사용자 칸이라 약속에 안 싣는다(ext 자리만).
 */
import type { Disposable } from '../../../pane-ui-system/plugin';

/** 구분 — 담임 과목 · 전담 과목 · 공통. */
export type SubjectKind = 'homeroom' | 'subject' | 'common';

/** 과목 목록 — 과목 여럿을 담는 묶음. */
export interface SubjectList {
    id: string;
    name: string;
}

/** 목록 안의 과목 하나. */
export interface Subject {
    id: string;
    listId: string;
    name: string;
    /** 약칭(선택). */
    short?: string;
    memo?: string;
    /** 구분(선택 — 안 골랐으면 없다). */
    kind?: SubjectKind;
    /** 확장 칸 자리 — 위층이 플러그인 id 로 이름공간을 잡아 꽂는다. */
    ext?: Record<string, unknown>;
}

export interface SubjectInput {
    name: string;
    short?: string;
    memo?: string;
}

export interface SubjectPatch {
    name?: string;
    short?: string;
    memo?: string;
}

/** 과목 표면 — 다른 플러그인이 과목 목록을 읽고 쓰는 자리. */
export interface Subjects {
    version: 1;
    lists(): readonly SubjectList[];
    subjectsIn(listId: string): readonly Subject[];
    subject(id: string): Subject | undefined;
    /** 돌려준 id 가 빈 문자열이면 못 만든 것. */
    addSubject(listId: string, input: SubjectInput): string;
    updateSubject(id: string, patch: SubjectPatch): void;
    /** 🔴 휴지통으로(영구 아님). */
    removeSubject(id: string): void;
    moveSubject(id: string, listId: string, index?: number): void;
    /** 탭·줄바꿈 구분 텍스트 붙여 넣기 — 칸 순서는 기본 칸(이름·약칭·메모). 만들어진 id 들. */
    pasteSubjects(listId: string, text: string): string[];
    onChange(listener: () => void): Disposable;
}
