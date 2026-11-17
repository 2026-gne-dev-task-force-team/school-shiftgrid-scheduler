// ③ 7절 CORS·출처 검사. 허용 출처는 `ALLOWED_ORIGIN` 하나 — 글자 그대로 일치할 때만(`*` 불가).
// 환경변수를 읽는 자리는 loadAllowedOrigin 하나뿐, 나머지는 인자로 받는 순수 함수.

import { errors } from './errors.ts';

export const ALLOWED_ORIGIN_ENV = 'ALLOWED_ORIGIN';

/** Deno 전용 얇은 자리. 비어 있으면 undefined — 그러면 어떤 출처도 맞지 않는다(닫힌 쪽). */
export function loadAllowedOrigin(): string | undefined {
    const g = globalThis as { Deno?: { env: { get(name: string): string | undefined } } };
    const v = g.Deno?.env.get(ALLOWED_ORIGIN_ENV)?.trim();
    return v ? v : undefined;
}

export const PREFLIGHT_HEADERS: Readonly<Record<string, string>> = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE',
    'Access-Control-Allow-Headers': 'Authorization, apikey, x-client-info, Content-Type, If-Match',
    'Access-Control-Max-Age': '600',
};

/** 출처가 허용 출처와 글자 그대로 같은가. 허용 출처가 없거나 `*` 면 언제나 거짓. */
export function originAllowed(origin: string | null | undefined, allowed: string | undefined): boolean {
    if (!allowed || allowed === '*' || !origin) return false;
    return origin === allowed;
}

/** 응답마다 붙일 CORS 머리. 맞을 때만 Allow-Origin 을 낸다(Allow-Credentials 는 안 낸다 — 쿠키 없음). */
export function corsHeaders(origin: string | null | undefined, allowed: string | undefined): Record<string, string> {
    const h: Record<string, string> = { Vary: 'Origin', 'Access-Control-Expose-Headers': 'ETag' };
    if (originAllowed(origin, allowed)) h['Access-Control-Allow-Origin'] = origin as string;
    return h;
}

/** 상태를 바꾸는 요청(GET·HEAD·OPTIONS 외)인가 */
export function isStateChanging(method: string): boolean {
    const m = method.toUpperCase();
    return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

/** ③ 7절 셋째 줄 — 상태를 바꾸는 요청은 Origin 이 없거나 다르면 403 `origin_mismatch`. */
export function assertOrigin(method: string, origin: string | null | undefined, allowed: string | undefined): void {
    if (isStateChanging(method) && !originAllowed(origin, allowed)) throw errors.originMismatch();
}
