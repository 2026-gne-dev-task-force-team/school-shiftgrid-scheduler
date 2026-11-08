/**
 * 🔴 약속 「people」 0.1.0 — **사람 명단**의 타입 정의 자리(값 0).
 *   학교를 모른다 · 계정을 모른다(요구명세 핵심: 명단과 사람이라는 레이어 하나만). 그 위(학교 명부·계정)는 이 약속에 기대어 증축한다.
 *   ⛔ 값(const·function) 0 — 런타임 실체(명단·사람을 노드로 읽고 쓰는 것)는 제공자 플러그인(people) 안에 산다.
 *   소비자는 이 타입을 host.modules 로 받는다(약속 이름 people). uses 없음(가장 아래 약속 — 다른 약속을 import 하지 않는다).
 *
 * ⭐ 낱말 판정(요구명세 2026-11-08)
 *   - 같은 사람이 명단 둘에 있으면 **줄마다 따로인 사람**이다(연결 없음). 잇는 건 계정 레인이 나중에 증축한다.
 *   - 칸은 **이름·메모 둘뿐**이다. 학교 낱말(담임·반·과목)·계정 낱말은 ⛔ 여기 없다 — 그건 위층(school-roster·계정)의 몫이다.
 *   - 칸 꽂기 자리(ext)는 **타입에만** 비워 둔다 — 위층이 플러그인 id 로 이름공간을 잡아 꽂는다(⛔ 이 약속엔 쓰는 코드가 없다).
 */
import type { Disposable } from '../../../pane-ui-system/plugin';

/** 명단 — 사람 여럿을 담는 묶음(달력 저장소와 같은 결). 명단 안에 명단을 둘 수 있다. */
export interface PeopleList {
    id: string;
    /** 탐색기에 보이는 이름. */
    name: string;
}

/** 명단 안의 한 사람 — 줄 하나. 칸은 이름·메모뿐. */
export interface Person {
    id: string;
    /** 이 사람이 사는 명단의 id(노드 부모). 명단을 옮기면 바뀐다. */
    listId: string;
    /** ⛔ 공개 레포 — 샘플·테스트엔 지어낸 이름만. */
    name: string;
    /** 자유 메모(선택). */
    memo?: string;
    /**
     * 🔴 확장 칸 자리 — 위층(학교 명부·계정)이 **플러그인 id 로 이름공간**을 잡아 꽂는다(예: ext['school-roster'] = {…}).
     *   ⛔ 이 약속엔 읽고 쓰는 코드가 없다(자리만). people 플러그인도 이 칸을 건드리지 않는다.
     */
    ext?: Record<string, unknown>;
}

/** 사람 하나를 더하거나 고칠 때 넘기는 칸(이름·메모만). */
export interface PersonInput {
    name: string;
    memo?: string;
}

/** 사람 한 줄을 부분으로 고칠 때(빈 patch 는 무변경). */
export interface PersonPatch {
    name?: string;
    memo?: string;
}

/**
 * 🔴 사람 명단 표면 — 다른 플러그인이 명단·사람을 읽고 쓰는 자리. version 을 처음부터(갈아끼울 데: 버전 달린 표면으로 큰다).
 *   저장·휴지통은 제공자가 노드 시스템으로 한다 — 소비자는 그 속을 모른다(명단·사람만 본다).
 */
export interface People {
    version: 1;

    // ── 읽기 ──
    /** 살아 있는(휴지통 아닌) 명단 전부 — 트리 순서. */
    lists(): readonly PeopleList[];
    /** 그 명단의 사람들(살아 있는 것만, 트리 순서). 명단이 없거나 휴지통이면 빈 배열. */
    peopleIn(listId: string): readonly Person[];
    /** 사람 하나 — 없으면 undefined. */
    person(id: string): Person | undefined;

    // ── 쓰기 ──
    /** 그 명단에 사람 하나 더하기(끝에). 돌려준 id 가 빈 문자열이면 못 만든 것. */
    addPerson(listId: string, input: PersonInput): string;
    /** 사람 한 줄을 부분으로 고치기(이름·메모). */
    updatePerson(id: string, patch: PersonPatch): void;
    /** 사람 지우기 — 🔴 휴지통으로(영구 아님). 노드 시스템이 복원·되돌리기를 쥔다. */
    removePerson(id: string): void;
    /** 사람을 다른(또는 같은) 명단으로 옮기기 — index 를 주면 그 자리로(순서 바꾸기). */
    movePerson(id: string, listId: string, index?: number): void;
    /**
     * 🔴 여러 줄 붙여 넣기 — 엑셀·한글 표에서 복사한 탭·줄바꿈 구분 텍스트를 받아 사람 여럿을 만든다.
     *   첫 칸 = 이름 · 둘째 칸 = 메모 · 빈 줄은 무시 · 이름이 빈 줄도 무시. 돌려주는 건 만들어진 사람 id 들.
     */
    pastePeople(listId: string, text: string): string[];

    /** 명단·사람이 바뀔 때마다 부른다(노드 변경 구독). */
    onChange(listener: () => void): Disposable;
}
