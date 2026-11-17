import { describe, expect, it } from 'vitest';
import { bearerToken, judgeMember, requireProjectMember, type AuthClient } from './auth.ts';
import { isPastDate, seoulParts, seoulToday } from './clock.ts';
import { assertOrigin, corsHeaders, originAllowed } from './cors.ts';
import { errorResponse, HttpError, toErrorResponse } from './errors.ts';
import { handle, subPath } from './http.ts';

const ORIGIN = 'https://tt.example.org';

/** 가짜 supabase-js — 토큰 → 사용자, (pid,uid) → 행 */
function fakeClient(users: Record<string, string>, rows: Record<string, { roles: string[]; active: boolean }>): AuthClient {
    return {
        auth: {
            getUser: async (jwt) =>
                users[jwt] ? { data: { user: { id: users[jwt] } }, error: null } : { data: { user: null }, error: { status: 401 } },
        },
        from: () => ({
            select: () => ({
                eq: (_c1, pid) => ({
                    eq: (_c2, uid) => ({
                        maybeSingle: async () => ({ data: rows[`${pid}/${uid}`] ?? null, error: null }),
                    }),
                }),
            }),
        }),
    };
}
const client = fakeClient(
    { 'jwt-a': 'u-a', 'jwt-b': 'u-b', 'jwt-c': 'u-c' },
    { 'p1/u-a': { roles: ['교사'], active: true }, 'p1/u-c': { roles: ['관리자'], active: false } },
);

/** 로그인 필요 경로 하나를 흉내 낸 함수 — account/me 꼴 */
const memberRoute = (req: Request) =>
    handle(req, ORIGIN, async (r) => {
        const m = await requireProjectMember(client, r.headers.get('Authorization'), 'p1');
        return new Response(JSON.stringify({ roles: m.roles }), { status: 200 });
    });
const req = (method: string, headers: Record<string, string> = {}) =>
    new Request('https://ref.supabase.co/functions/v1/account/projects/p1/me', { method, headers });
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe('auth — 401·403 not_member·정지', () => {
    it('JWT 없음·꼴 틀림·Auth 거부는 401 unauthorized', async () => {
        const cases: Record<string, string>[] = [{}, { Authorization: 'jwt-a' }, { Authorization: 'Bearer nope' }];
        for (const h of cases) {
            const res = await memberRoute(req('GET', h));
            expect(res.status).toBe(401);
            expect(await codeOf(res)).toBe('unauthorized');
        }
    });
    it('만료 JWT(Auth 가 error 로 거부)·getUser 예외도 401 unauthorized', async () => {
        const expired: AuthClient = {
            ...client,
            auth: { getUser: async () => ({ data: { user: null }, error: { status: 401, code: 'bad_jwt', message: 'token is expired' } }) },
        };
        const throwing: AuthClient = { ...client, auth: { getUser: () => Promise.reject(new Error('net')) } };
        for (const c of [expired, throwing]) {
            const res = await handle(req('GET', { Authorization: 'Bearer jwt-a' }), ORIGIN, async (r) => {
                await requireProjectMember(c, r.headers.get('Authorization'), 'p1');
                return new Response('{}');
            });
            expect(res.status).toBe(401);
            expect(await codeOf(res)).toBe('unauthorized');
        }
    });
    it('비구성원은 403 not_member', async () => {
        const res = await memberRoute(req('GET', { Authorization: 'Bearer jwt-b' }));
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe('not_member');
    });
    it('정지 계정(active=false)은 살아 있는 JWT 로도 403 not_member', async () => {
        const res = await memberRoute(req('GET', { Authorization: 'Bearer jwt-c' }));
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe('not_member');
    });
    it('구성원은 통과 · 역할이 실린다', async () => {
        const res = await memberRoute(req('GET', { Authorization: 'Bearer jwt-a' }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ roles: ['교사'] });
    });
    it('bearerToken · judgeMember 경계', () => {
        expect(bearerToken('bearer  x.y.z ')).toBe('x.y.z');
        expect(bearerToken('Basic abc')).toBeNull();
        expect(() => judgeMember({ roles: ['모름'], active: true }, 'u', 'p')).toThrow(HttpError);
        expect(judgeMember({ roles: ['교사', '모름'], active: true }, 'u', 'p').roles).toEqual(['교사']);
    });
});

describe('cors·Origin', () => {
    it('글자 그대로 일치만 · * 와 빈 허용 출처는 닫힘', () => {
        expect(originAllowed(ORIGIN, ORIGIN)).toBe(true);
        expect(originAllowed(ORIGIN + '/', ORIGIN)).toBe(false);
        expect(originAllowed('https://evil.org', '*')).toBe(false);
        expect(originAllowed(ORIGIN, undefined)).toBe(false);
        expect(corsHeaders('https://evil.org', ORIGIN)['Access-Control-Allow-Origin']).toBeUndefined();
        expect(corsHeaders(ORIGIN, ORIGIN)['Access-Control-Allow-Origin']).toBe(ORIGIN);
    });
    it('상태 바꾸는 요청: Origin 없음·불일치는 403 origin_mismatch (인증보다 먼저)', async () => {
        for (const o of [undefined, 'https://evil.org']) {
            const h: Record<string, string> = { Authorization: 'Bearer jwt-a' };
            if (o) h.Origin = o;
            const res = await memberRoute(req('POST', h));
            expect(res.status).toBe(403);
            expect(await codeOf(res)).toBe('origin_mismatch');
        }
        expect(() => assertOrigin('GET', null, ORIGIN)).not.toThrow();
    });
    it('맞는 Origin 의 POST 는 통과하고 Allow-Origin 이 붙는다', async () => {
        const res = await memberRoute(req('POST', { Authorization: 'Bearer jwt-a', Origin: ORIGIN }));
        expect(res.status).toBe(200);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    });
    it('OPTIONS 사전 요청은 204 + ③ 7절 머리', async () => {
        const res = await memberRoute(req('OPTIONS', { Origin: ORIGIN }));
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Headers')).toContain('If-Match');
        expect(res.headers.get('Access-Control-Max-Age')).toBe('600');
        expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    });
});

describe('errors', () => {
    it('{error:{code,message}} 꼴 · no-store · nosniff', async () => {
        const res = errorResponse(404, 'not_found', '없는 주소입니다');
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(await res.json()).toEqual({ error: { code: 'not_found', message: '없는 주소입니다' } });
    });
    it('덧붙임 칸이 실리고 code 는 덮이지 않는다', async () => {
        const res = toErrorResponse(new HttpError(413, 'part_too_large', '큼', { part: 'doc', code: 'x' }));
        expect(await res.json()).toEqual({ error: { part: 'doc', code: 'part_too_large', message: '큼' } });
    });
    it('모르는 오류는 500 internal — 원문 메시지를 안 싣는다', async () => {
        const res = toErrorResponse(new Error('secret=abc'));
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain('secret');
    });
    it('subPath 는 함수 이름 뒤 조각', () => {
        expect(subPath('https://r.supabase.co/functions/v1/account/projects/p%201/me', 'account')).toEqual(['projects', 'p 1', 'me']);
        expect(subPath('http://localhost/health', 'health')).toEqual([]);
    });
});

describe('clock — 서울 날짜 경계(① D2 공유)', () => {
    const at = (iso: string) => () => new Date(iso);
    it('서울 08:59(UTC 전날 23:59)에 「오늘」은 이미 서울 날짜', () => {
        expect(seoulToday(at('2026-11-16T23:59:00Z'))).toBe('2026-11-17');
        expect(seoulParts(new Date('2026-11-16T23:59:00Z')).minute).toBe(8 * 60 + 59);
        // 08:59 서울에 그날 보결 등록 — 지난 날 아님
        expect(isPastDate('2026-11-17', at('2026-11-16T23:59:00Z'))).toBe(false);
    });
    it('서울 09:00(UTC 00:00) — UTC 날짜가 바뀌어도 서울 날짜는 그대로', () => {
        expect(seoulToday(at('2026-11-17T00:00:00Z'))).toBe('2026-11-17');
        expect(seoulParts(new Date('2026-11-17T00:00:00Z')).minute).toBe(9 * 60);
    });
    it('서울 자정(UTC 15:00)에서 날이 바뀐다', () => {
        expect(seoulToday(at('2026-11-16T14:59:00Z'))).toBe('2026-11-16');
        expect(seoulToday(at('2026-11-16T15:00:00Z'))).toBe('2026-11-17');
        expect(seoulParts(new Date('2026-11-16T15:00:00Z')).minute).toBe(0);
        expect(isPastDate('2026-11-16', at('2026-11-16T15:00:00Z'))).toBe(true);
    });
    it('날짜 꼴이 아니면 던진다', () => {
        expect(() => isPastDate('2026-1-7', at('2026-11-16T15:00:00Z'))).toThrow();
    });
});
