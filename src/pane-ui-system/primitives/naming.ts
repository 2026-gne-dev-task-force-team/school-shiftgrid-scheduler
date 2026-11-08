/**
 * 이름 짓기 — 「겹치면 뒤에 숫자」. 시작 화면 「새로 만들기」가 쓰는 순수 함수(도메인 0).
 *   base 가 안 겹치면 그대로, 겹치면 `base 2`·`base 3`… 처음 비는 자리를 돌려준다(그리드 시작 화면과 같은 규칙).
 */
export function uniqueName(base: string, taken: Iterable<string>): string {
    const set = taken instanceof Set ? taken : new Set(taken);
    let name = base;
    for (let i = 2; set.has(name); i++) name = `${base} ${i}`;
    return name;
}
