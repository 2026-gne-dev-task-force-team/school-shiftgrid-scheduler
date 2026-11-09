/**
 * 우클릭 핸들러를 다른 포인터 핸들러(범위 끌기)와 한 요소에 같이 얹을 때 — 같은 이름은 둘 다 부른다(R6).
 */
type Fn = (e: never) => void;
export function mergeBind<A extends Record<string, Fn | undefined>, B extends Record<string, Fn | undefined>>(a: A, b: B): A & B {
    const out: Record<string, Fn> = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const f = a[k], g = b[k];
        out[k] = f && g ? ((e: never) => { f(e); g(e); }) : (f ?? g)!;
    }
    return out as A & B;
}
