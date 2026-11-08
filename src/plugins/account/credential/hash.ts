/**
 * 솔트 해시 — crypto.subtle(평문 0). ⚠️ account 꾸러미 증명 부품 전용 사본이다(플러그인끼리 값 import 금지 — 구조 검사 ⑨).
 *   account 의 hash.ts 와 같은 꼴이지만 각자 둔다(결합 0). 강도 논쟁은 접었다(쥔님 판정) — SHA-256(솔트+비번) 한 겹.
 */
export interface Hashed {
    salt: string;
    hash: string;
}

function toHex(buf: ArrayBuffer): string {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function digestHex(saltHex: string, password: string): Promise<string> {
    const bytes = new TextEncoder().encode(`${saltHex}:${password}`);
    return toHex(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}

export async function makeHash(password: string): Promise<Hashed> {
    const salt = new Uint8Array(16);
    globalThis.crypto.getRandomValues(salt);
    const saltHex = [...salt].map((b) => b.toString(16).padStart(2, '0')).join('');
    return { salt: saltHex, hash: await digestHex(saltHex, password) };
}
export async function verifyHash(password: string, h: Hashed | null | undefined): Promise<boolean> {
    if (!h || typeof h.salt !== 'string' || typeof h.hash !== 'string') return false;
    const got = await digestHex(h.salt, password);
    return got.length === h.hash.length && got === h.hash;
}
