/**
 * 보관 자리 — 창틀이 기기별로 기억하는 것(패널 폭·접힘·테마)의 localStorage 키를 만든다.
 *
 * 🔴 ⛔ 창틀은 자기를 쓰는 앱의 이름을 모른다. 이름을 박으면 다른 프로젝트에 떼어 갈 때 따라온다
 *    (구조 검사 ⑤가 실제로 막는다 — 처음 켜자마자 앱 이름이 박힌 키 두 건을 잡았다).
 *    그래서 앱이 시작할 때 접두사를 한 번 알려 준다:  setStoragePrefix('<앱 이름>.v2')
 *
 * ⚠️ 안 알려 주면 'ui-system' 으로 산다 — 고장은 아니고, 한 도메인에 앱이 둘이면 그때 섞인다.
 */
let prefix = 'ui-system';

export function setStoragePrefix(p: string): void {
    if (p) prefix = p;
}

export function storageKey(name: string): string {
    return `${prefix}.${name}`;
}
