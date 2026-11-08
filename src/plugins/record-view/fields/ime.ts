/**
 * 한글 IME 가드 — 조합 중 Enter 는 「확정」이 아니라 「글자 조합 끝」이다. 이걸 값 확정으로 받으면 마지막 글자가 두 번 들어가거나 잘린다.
 *   🔴 셀·칸 이름·선택지 입력 셋 다 이 한 함수를 지난다(명세 「한글 IME」). 사파리·옛 크롬은 isComposing 이 false 로 오고 keyCode 만 229 라 둘 다 본다.
 */
export function isImeEnter(e: { key: string; keyCode?: number; nativeEvent?: { isComposing?: boolean }; isComposing?: boolean }): boolean {
    if (e.key !== 'Enter') return false;
    return !!(e.nativeEvent?.isComposing ?? e.isComposing) || e.keyCode === 229;
}
