/**
 * 🔴 키 입력을 「무엇을 하나」로 옮기는 순수 판정(명세 요구 6·11). 뷰는 이 답만 보고 움직인다.
 *   ⭐ 한글 IME: 조합 중(isComposing)엔 무조건 default — 가로채면 글자가 깨진다(명세 요구 11).
 */

export type KeyAction =
    | 'default'        // 브라우저에 맡긴다(글자 입력·줄 안 이동 등)
    | 'split'          // Enter → 캐럿에서 가르기
    | 'list-break'     // 빈 목록 Enter → 들여쓰기 풀기/문단
    | 'merge-prev'     // Backspace(맨 앞) → 합치기/풀기
    | 'indent'         // Tab
    | 'outdent'        // ⇧Tab
    | 'nav-prev'       // ↑(맨 앞) → 앞 블록으로
    | 'nav-next'       // ↓(맨 끝) → 뒤 블록으로
    | 'bold'           // ⌘B
    | 'italic'         // ⌘I
    | 'undo'           // ⌘Z
    | 'redo';          // ⇧⌘Z

export interface KeyInput {
    key: string;
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    /** 🔴 한글 조합 중인가(compositionstart~end · isComposing). */
    isComposing: boolean;
    /** 캐럿이 글자 맨 앞인가. */
    atStart: boolean;
    /** 캐럿이 글자 맨 끝인가. */
    atEnd: boolean;
    /** 블록 글자가 비었나. */
    isEmpty: boolean;
    /** 목록 블록인가(글머리표·번호·체크). */
    isListBlock: boolean;
    /** 코드 블록인가(Enter 는 줄바꿈이라 가르지 않는다). */
    isCodeBlock: boolean;
}

/**
 * 키 하나 → 동작. 🔴 조합 중이면 어떤 키도 가로채지 않는다(가장 먼저 판정).
 */
export function decideKey(i: KeyInput): KeyAction {
    // 🔴 명세 요구 11 — 조합 중엔 무변환.
    if (i.isComposing) return 'default';

    const mod = i.metaKey || i.ctrlKey;
    if (mod) {
        const k = i.key.toLowerCase();
        if (k === 'z') return i.shiftKey ? 'redo' : 'undo';
        if (k === 'y') return 'redo';
        if (k === 'b') return 'bold';
        if (k === 'i') return 'italic';
        return 'default';
    }

    if (i.key === 'Enter') {
        if (i.isCodeBlock) return 'default';     // 코드 블록은 줄바꿈
        if (i.isListBlock && i.isEmpty) return 'list-break';
        return 'split';
    }
    if (i.key === 'Backspace') {
        return i.atStart ? 'merge-prev' : 'default';
    }
    if (i.key === 'Tab') {
        return i.shiftKey ? 'outdent' : 'indent';
    }
    if (i.key === 'ArrowUp') {
        return i.atStart ? 'nav-prev' : 'default';
    }
    if (i.key === 'ArrowDown') {
        return i.atEnd ? 'nav-next' : 'default';
    }
    return 'default';
}
