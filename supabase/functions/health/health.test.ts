import { describe, expect, it } from 'vitest';
import { healthHandler, serverIdFromUrl } from './handler.ts';

const get = (headers: Record<string, string> = {}, method = 'GET') =>
    new Request('https://abcref.supabase.co/functions/v1/health', { method, headers });

describe('health', () => {
    it('JWT 없이 200 · 꼴 {ok, api, serverId}', async () => {
        const h = healthHandler({ ping: async () => true, serverId: 'abcref', allowedOrigin: 'https://tt.example.org' });
        const res = await h(get());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, api: 1, serverId: 'abcref' });
        expect(res.headers.get('Cache-Control')).toBe('no-store');
    });
    it('DB 핑 실패·예외는 503 db_unavailable', async () => {
        for (const ping of [async () => false, async () => Promise.reject(new Error('x'))]) {
            const res = await healthHandler({ ping, serverId: 's', allowedOrigin: undefined })(get());
            expect(res.status).toBe(503);
            expect(await res.json()).toMatchObject({ error: { code: 'db_unavailable' } });
        }
    });
    it('GET 외 방식은 405 (Origin 이 맞을 때)', async () => {
        const o = 'https://tt.example.org';
        const res = await healthHandler({ ping: async () => true, serverId: 's', allowedOrigin: o })(get({ Origin: o }, 'POST'));
        expect(res.status).toBe(405);
    });
    it('serverId 는 Supabase ref · 그 밖은 local', () => {
        expect(serverIdFromUrl('https://abcdefgh.supabase.co')).toBe('abcdefgh');
        expect(serverIdFromUrl('http://kong:8000')).toBe('local');
        expect(serverIdFromUrl(undefined)).toBe('local');
        expect(serverIdFromUrl('not a url')).toBe('local');
    });
});
