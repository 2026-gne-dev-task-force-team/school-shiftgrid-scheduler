// ④ 6-1 키 — `TT_OPS_KEYS` 비밀(한 줄에 `kid:base64`, 마지막 줄이 쓰기 키)과 콜드 스타트 검사 넷.
// 환경변수를 읽는 자리는 loadKeyText 하나뿐이다. 나머지는 순수 함수(인자로 받음) — Node 에서도 시험된다.

import { open, type AadFor, type Bytes, type KeyRing } from './envelope.ts';

export const KEYS_ENV_NAME = 'TT_OPS_KEYS';

/** 환경변수를 읽는 얇은 자리(Deno 전용). 시험·Node 에선 안 부르고 문자열을 직접 넘긴다. */
export function loadKeyText(): string | undefined {
    const g = globalThis as { Deno?: { env: { get(name: string): string | undefined } } };
    return g.Deno?.env.get(KEYS_ENV_NAME);
}

/** 6-1 검사 번호(1~4). 함수는 503 `key_check {n}` 로 거부하고 로그엔 번호만 적는다(값 없음). */
export class KeyCheckError extends Error {
    readonly n: 1 | 2 | 3 | 4;
    constructor(n: 1 | 2 | 3 | 4) {
        super(`key_check ${n}`);
        this.name = 'KeyCheckError';
        this.n = n;
    }
}

export interface ParsedKeys {
    writeKid: string;
    /** 파일 순서 그대로(마지막이 쓰기 키) */
    entries: { kid: string; raw: Bytes }[];
}

const LINE_RE = /^([A-Za-z0-9_-]{1,32}):([A-Za-z0-9+/]{43}=)$/;

/** 검사 1·2. 값은 오류 메시지에 넣지 않는다. */
export function parseKeys(text: string | undefined): ParsedKeys {
    if (text === undefined || text.trim() === '') throw new KeyCheckError(1);
    const lines = text.trim().split('\n').map((l) => l.replace(/\r$/, ''));
    const entries: ParsedKeys['entries'] = [];
    const seen = new Set<string>();
    for (const line of lines) {
        const m = LINE_RE.exec(line);
        if (!m || seen.has(m[1])) throw new KeyCheckError(2);
        let raw: Bytes;
        try {
            raw = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        } catch {
            throw new KeyCheckError(2);
        }
        if (raw.length !== 32) throw new KeyCheckError(2);
        seen.add(m[1]);
        entries.push({ kid: m[1], raw });
    }
    return { writeKid: entries[entries.length - 1].kid, entries };
}

export async function buildKeyRing(parsed: ParsedKeys): Promise<KeyRing> {
    const keys = new Map<string, CryptoKey>();
    for (const e of parsed.entries) {
        keys.set(e.kid, await crypto.subtle.importKey('raw', e.raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
    }
    return { writeKid: parsed.writeKid, keys };
}

export interface KeyCheckInput {
    text: string | undefined;
    /** meta.kids_in_use — DB 가 쓰고 있다고 적은 kid 들 */
    kidsInUse: readonly string[];
    /** 검사 4 용 — DB 조각 하나. DB 가 비었으면 null(건너뜀). */
    sample: { envelope: Bytes; aadFor: AadFor } | null;
}

/** 넷을 차례로 본다. 하나라도 걸리면 KeyCheckError(n) — 새 키를 만들지 않는다. 통과하면 KeyRing. */
export async function checkKeys(input: KeyCheckInput): Promise<KeyRing> {
    const parsed = parseKeys(input.text);                       // 1·2
    const have = new Set(parsed.entries.map((e) => e.kid));
    if (input.kidsInUse.some((k) => !have.has(k))) throw new KeyCheckError(3);
    const ring = await buildKeyRing(parsed);
    if (input.sample) {
        try {
            await open(ring, input.sample.envelope, input.sample.aadFor);
        } catch {
            throw new KeyCheckError(4);
        }
    }
    return ring;
}

let cached: KeyRing | null = null;

/** 인스턴스 안에서 한 번만 검사한다(콜드 스타트). DB 쪽 값은 호출자가 읽어 넘긴다. */
export async function ensureKeys(read: () => Promise<Omit<KeyCheckInput, 'text'>>): Promise<KeyRing> {
    if (cached) return cached;
    cached = await checkKeys({ text: loadKeyText(), ...(await read()) });
    return cached;
}

/** 시험용 — 캐시 비우기 */
export function resetKeyCache(): void {
    cached = null;
}
