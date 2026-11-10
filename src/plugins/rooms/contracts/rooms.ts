/**
 * 🔴 약속 「rooms」 0.1.0 — **방(공간) 목록**의 타입 정의 자리(값 0).
 *   학교를 모른다 · 예약을 모른다 · 계정을 모른다(요구명세 핵심: 목록과 방이라는 레이어 하나만).
 *   그 위(예약·학교 명부)는 이 약속에 기대어 증축한다 — (옛 contract-roster 는 2026-11-10 걷었다 — 다시 정의한다.)
 *   ⛔ 값(const·function) 0 — 런타임 실체(목록·방을 노드로 읽고 쓰는 것)는 제공자 플러그인(rooms) 안에 산다.
 *   소비자는 이 타입을 host.modules 로 받는다(약속 이름 rooms). uses 없음(가장 아래 약속 — 다른 약속을 import 하지 않는다).
 *
 * ⭐ 낱말 판정(요구명세 2026-11-08)
 *   - 방은 「그냥 일반적인 공간」이다(쥔님 *"그냥 완전 일반적인 스팟 그냥 공간, 여기선 일반적으로 room 방이라고 하지"*). ⛔ 특별실·교실 같은 학교 낱말은 없다.
 *   - 방 안에 방 — 방은 **같은 목록 안의 다른 방**을 부모로 가질 수 있다(선택 · 쥔님 *"일단 허용하지 방안에 방"*). 순환은 막는다.
 *   - 칸은 **이름·메모 둘뿐**이다. 수용 수·과목·예약 같은 칸은 ⛔ 여기 없다 — 그건 위층의 몫이다.
 *   - 칸 꽂기 자리(ext)는 **타입에만** 비워 둔다 — 위층이 플러그인 id 로 이름공간을 잡아 꽂는다(⛔ 이 약속엔 쓰는 코드가 없다).
 */
import type { Disposable } from '../../../pane-ui-system/plugin';

/** 방 목록 — 방 여럿을 담는 묶음(달력 저장소와 같은 결). 목록 안에 목록을 둘 수 있다. */
export interface RoomList {
    id: string;
    /** 탐색기에 보이는 이름. */
    name: string;
}

/** 목록 안의 한 방 — 줄 하나. 칸은 이름·메모뿐. */
export interface Room {
    id: string;
    /** 이 방이 사는 목록의 id(노드 부모). 목록을 옮기면 바뀐다. */
    listId: string;
    /** ⛔ 공개 레포 — 샘플·테스트엔 지어낸 이름만(예: 「1층 복도 끝 방」). */
    name: string;
    /** 자유 메모(선택). */
    memo?: string;
    /**
     * 🔴 방 안에 방 — 같은 목록 안의 **부모 방** id(선택). 없으면(또는 가리키는 방이 사라졌으면) 목록 최상위.
     *   순환(자기 자손을 부모로)은 제공자가 막는다 · 부모 방을 지우면 자식은 최상위로 올라온다(부모가 가리키던 자리에서 풀린다).
     */
    parentId?: string;
    /**
     * 🔴 확장 칸 자리 — 위층(예약·학교 명부)이 **플러그인 id 로 이름공간**을 잡아 꽂는다(예: ext['reservations'] = {…}).
     *   ⛔ 이 약속엔 읽고 쓰는 코드가 없다(자리만). rooms 플러그인도 이 칸을 건드리지 않는다.
     */
    ext?: Record<string, unknown>;
}

/** 방 하나를 더하거나 고칠 때 넘기는 칸(이름·메모만). */
export interface RoomInput {
    name: string;
    memo?: string;
}

/** 방 한 줄을 부분으로 고칠 때(빈 patch 는 무변경). */
export interface RoomPatch {
    name?: string;
    memo?: string;
}

/**
 * 🔴 방 목록 표면 — 다른 플러그인이 목록·방을 읽고 쓰는 자리. version 을 처음부터(갈아끼울 데: 버전 달린 표면으로 큰다).
 *   저장·휴지통은 제공자가 노드 시스템으로 한다 — 소비자는 그 속을 모른다(목록·방만 본다).
 */
export interface Rooms {
    version: 1;

    // ── 읽기 ──
    /** 살아 있는(휴지통 아닌) 목록 전부 — 트리 순서. */
    lists(): readonly RoomList[];
    /** 그 목록의 방들(살아 있는 것만, 노드 순서). parentId 로 방 안에 방을 읽는다. 목록이 없거나 휴지통이면 빈 배열. */
    roomsIn(listId: string): readonly Room[];
    /** 방 하나 — 없으면 undefined. */
    room(id: string): Room | undefined;

    // ── 쓰기 ──
    /** 그 목록에 방 하나 더하기(끝에, 최상위). 돌려준 id 가 빈 문자열이면 못 만든 것. */
    addRoom(listId: string, input: RoomInput): string;
    /** 방 한 줄을 부분으로 고치기(이름·메모). */
    updateRoom(id: string, patch: RoomPatch): void;
    /** 방 지우기 — 🔴 휴지통으로(영구 아님). 자식 방은 최상위로 올라온다. 노드 시스템이 복원·되돌리기를 쥔다. */
    removeRoom(id: string): void;
    /** 방을 다른(또는 같은) 목록으로 옮기기 — index 를 주면 그 자리로(순서 바꾸기). */
    moveRoom(id: string, listId: string, index?: number): void;
    /**
     * 🔴 방 안에 방 — 같은 목록 안의 부모 방을 정한다(null 이면 최상위로).
     *   다른 목록의 방·순환(자기 자손)은 조용히 거절한다.
     */
    setParentRoom(id: string, parentId: string | null): void;
    /**
     * 🔴 여러 줄 붙여 넣기 — 엑셀·한글 표에서 복사한 탭·줄바꿈 구분 텍스트를 받아 방 여럿을 만든다(전부 최상위).
     *   첫 칸 = 이름 · 둘째 칸 = 메모 · 빈 줄은 무시 · 이름이 빈 줄도 무시. 돌려주는 건 만들어진 방 id 들.
     */
    pasteRooms(listId: string, text: string): string[];

    /** 목록·방이 바뀔 때마다 부른다(노드 변경 구독). */
    onChange(listener: () => void): Disposable;
}
