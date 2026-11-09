/**
 * 🔴 약속 「selection」 0.1 — 「지금 무엇이 골라졌나」를 플러그인끼리 알린다(타입만).
 *   제공자: selection 꾸러미(provides: selection). 알리는 쪽(탐색기 등)·듣는 쪽(속성 패널 등) 모두 supports 로 받는다.
 *   ⭐ 마지막 하나만 쥔다 — 누가 알렸든 마지막 set 이 이긴다. null = 고른 것 풀림.
 *   type 은 대상 종류 문자열(노드면 노드 타입) — 속성 칸(contributes.properties)의 target 과 같은 값이어야 짝이 맞는다.
 */
export interface SelectionTarget { type: string; id: string }

export interface SelectionApi {
    set(target: SelectionTarget | null): void;
    get(): SelectionTarget | null;
    /** 바뀌면 부른다 — 돌려준 함수로 끊는다(useSyncExternalStore 꼴). */
    subscribe(fn: () => void): () => void;
}
