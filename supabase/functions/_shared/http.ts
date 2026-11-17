// 함수 진입점 공통 껍데기: OPTIONS 사전 요청 → Origin 검사(상태 바꾸는 요청) → 본 처리 → 오류 꼴.
// 모든 응답에 CORS 머리를 붙인다. 순수(Request → Response) — Deno.serve 는 각 함수 index.ts 가 건다.

import { assertOrigin, corsHeaders, PREFLIGHT_HEADERS } from './cors.ts';
import { BASE_HEADERS, toErrorResponse } from './errors.ts';

export type Handler = (req: Request) => Promise<Response> | Response;

export async function handle(req: Request, allowedOrigin: string | undefined, inner: Handler): Promise<Response> {
    const origin = req.headers.get('Origin');
    const cors = corsHeaders(origin, allowedOrigin);
    if (req.method.toUpperCase() === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...BASE_HEADERS, ...cors, ...PREFLIGHT_HEADERS } });
    }
    try {
        assertOrigin(req.method, origin, allowedOrigin);
        const res = await inner(req);
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        return res;
    } catch (e) {
        return toErrorResponse(e, cors);
    }
}

/** 함수 URL `/functions/v1/<함수>/<하위…>` 또는 `/<함수>/<하위…>` 에서 하위 경로 조각들 */
export function subPath(url: string, fnName: string): string[] {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const i = parts.indexOf(fnName);
    return i < 0 ? [] : parts.slice(i + 1).map((s) => decodeURIComponent(s));
}
