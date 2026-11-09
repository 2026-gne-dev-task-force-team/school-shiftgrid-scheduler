/**
 * 열 타입(M2 col-types) 보조 — bool 칸의 「켜졌나」 판정과 뒤집기 값.
 *   편집기는 글자만 저장한다(약속). bool 은 '1'=켜짐 · ''(또는 0·false·no)=꺼짐 으로 약속한다.
 */

/** bool 칸이 켜진 상태인가. */
export function isChecked(value: string): boolean {
    const v = value.trim().toLowerCase();
    return v !== '' && v !== '0' && v !== 'false' && v !== 'no' && v !== 'n';
}

/** bool 칸을 뒤집은 값('1' ↔ ''). */
export function toggledValue(value: string): string {
    return isChecked(value) ? '' : '1';
}
