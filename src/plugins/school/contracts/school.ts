/**
 * 🔴 약속 「school」 0.1.0 — **학교 정보**의 타입 정의 자리(값 0). 학교 하나 · 학년도 목록 · 학년도의 반 목록.
 *   ⛔ 값(const·function) 0 — 런타임 실체는 제공자 플러그인(school) 안에 산다. 소비자는 host.modules.use<School>('school').
 *   ⛔ 과목·담임·나이스는 이 약속에 없다(1차 범위 밖). ⛔ 공개 레포 — 샘플·테스트엔 지어낸 이름만.
 */
import type { Disposable } from '../../../pane-ui-system/plugin';

export type SchoolLevel = 'elementary' | 'middle' | 'high' | 'special';

/** 학교 — 나무에 하나(싱글톤). */
export interface SchoolInfo {
    id: string;
    name: string;
    /** 학교급(고르기 전엔 없다). */
    level?: SchoolLevel;
    memo?: string;
}

/** 학년도 — 반을 담는 목록(예: 「2026 학년도」). */
export interface SchoolYear {
    id: string;
    name: string;
}

/** 반 하나 — 학년도 안의 줄. */
export interface SchoolClass {
    id: string;
    yearId: string;
    /** 예: 「3-2」. */
    name: string;
    grade?: number;
    no?: number;
    /** 교실로 고른 방 노드 id 들(방 목록 플러그인의 방) — 비어 있을 수 있다. */
    rooms: string[];
    /** 도움반 여부. */
    special: boolean;
    memo?: string;
}

export interface School {
    version: 1;
    /** 살아 있는 학교 — 없으면 undefined. */
    school(): SchoolInfo | undefined;
    years(): readonly SchoolYear[];
    classesIn(yearId: string): readonly SchoolClass[];
    /** 학교·학년도·반이 바뀔 때마다. */
    onChange(listener: () => void): Disposable;
}
