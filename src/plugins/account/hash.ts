/**
 * 솔트 해시 — crypto.subtle 로 비밀번호를 해시한다(평문 0). 🔴 ⛔ 평문을 노드에 싣지 않는다(쥔님 2026-11-08 · 실수 방지라도 해시로).
 *   강도 논쟁은 접었다(쥔님 판정) — SHA-256(솔트+비번) 한 겹. 서버 판이 오면 그때 PBKDF2·서버 해시로 갈아 낀다.
 *   ⚠️ 이 파일은 account 전용 사본이다(플러그인끼리 값 import 금지 — 구조 검사 ⑨). credential-local 은 제 사본을 둔다.
 */
export interface Hashed {
    salt: string;   // hex
    hash: string;   // hex (SHA-256 of salt+password)
}

function toHex(buf: ArrayBuffer): string {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function digestHex(saltHex: string, password: string): Promise<string> {
    const bytes = new TextEncoder().encode(`${saltHex}:${password}`);
    const out = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return toHex(out);
}

/** 새 솔트로 해시 한 벌을 만든다. */
export async function makeHash(password: string): Promise<Hashed> {
    const salt = new Uint8Array(16);
    globalThis.crypto.getRandomValues(salt);
    const saltHex = [...salt].map((b) => b.toString(16).padStart(2, '0')).join('');
    return { salt: saltHex, hash: await digestHex(saltHex, password) };
}

/** 그 비밀번호가 저장된 해시와 맞나. 저장값이 깨졌으면 false. */
export async function verifyHash(password: string, h: Hashed | null | undefined): Promise<boolean> {
    if (!h || typeof h.salt !== 'string' || typeof h.hash !== 'string') return false;
    const got = await digestHex(h.salt, password);
    // 길이가 같을 때만 비교(간단 비교 — 실수 방지 목적, 타이밍 방어는 서버 판에서)
    return got.length === h.hash.length && got === h.hash;
}
