// ③ 11-1 오류 꼴 `{error:{code, message}}` 하나 + 함수 응답 공통 머리(③ 7절 끝 줄).
// 순수 함수만 — Response·Headers 는 Deno·Node 18+ 공용 전역이다.

/** 함수 전부에 붙는 응답 머리(③ 7절) */
export const BASE_HEADERS: Readonly<Record<string, string>> = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
};

/** 판정 함수가 던지는 오류 — 진입점이 errorResponse 로 바꾼다. */
export class HttpError extends Error {
    readonly status: number;
    readonly code: string;
    /** `{error:{code,message,…extra}}` 에 덧붙일 칸(예: part_too_large {part, limit, size}) */
    readonly extra?: Record<string, unknown>;
    constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

/** 자주 쓰는 오류 — 코드 낱말을 한 곳에 묶는다. */
export const errors = {
    unauthorized: () => new HttpError(401, 'unauthorized', '로그인이 필요합니다'),
    notMember: () => new HttpError(403, 'not_member', '이 프로젝트 구성원이 아니거나 정지된 계정입니다'),
    originMismatch: () => new HttpError(403, 'origin_mismatch', '허용되지 않은 출처입니다'),
    notFound: () => new HttpError(404, 'not_found', '없는 주소입니다'),
    methodNotAllowed: () => new HttpError(405, 'method_not_allowed', '허용되지 않은 방식입니다'),
};

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...BASE_HEADERS, ...headers },
    });
}

export function errorResponse(
    status: number,
    code: string,
    message: string,
    headers: Record<string, string> = {},
    extra?: Record<string, unknown>,
): Response {
    return jsonResponse({ error: { ...extra, code, message } }, status, headers);
}

/**
 * 던져진 것 → 응답. HttpError 가 아니면 500 `internal` — 원래 메시지는 응답에 싣지 않는다
 * (비밀·스택이 새지 않게 · 로그는 부르는 쪽 몫).
 */
export function toErrorResponse(e: unknown, headers: Record<string, string> = {}): Response {
    if (e instanceof HttpError) return errorResponse(e.status, e.code, e.message, headers, e.extra);
    return errorResponse(500, 'internal', '서버 오류입니다', headers);
}
