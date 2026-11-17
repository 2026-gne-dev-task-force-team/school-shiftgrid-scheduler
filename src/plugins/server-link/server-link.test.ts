/**
 * server-link(③ F1 · ② B17) — 가짜 supabase 클라이언트로 돈다(네트워크 0).
 *   미설정 · 끊김 세 갈래 · 바뀜 없으면 함수 호출 0 · 바뀐 조각만 · 로그아웃 시 구독 해제.
 */
import { describe, it, expect, vi } from 'vitest';
import { createServerLink, isConfigured, type LinkClient } from './link';
import { createPoller, POLL_INTERVAL_MS, type PollQuery } from './poll';
import { classifyFailure } from './errors';

/** 가짜 서버 — 표 둘(sub_slot·parts)과 인증 구독 하나. 쿼리 기록을 남긴다. */
function fakeServer() {
    const db = {
        sub: [{ updated_at: '2026-11-17T09:00:00Z' }] as { updated_at: string }[],
        parts: [{ part: 'grid', version: 1 }, { part: 'people', version: 3 }] as { part: string; version: number }[],
        error: null as null | { error: unknown; status: number },
    };
    const queries: string[] = [];
    let authCb: ((event: string, session: unknown) => void) | null = null;
    const unsubscribe = vi.fn();
    const client: LinkClient = {
        from(table: string) {
            return {
                select(cols: string) {
                    queries.push(`${table}:${cols}`);
                    const q = {
                        eq: () => q, order: () => q, limit: () => q,
                        then(res: (v: { data: unknown; error: unknown; status?: number }) => unknown, rej?: (e: unknown) => unknown) {
                            const out = db.error
                                ? { data: null, error: db.error.error, status: db.error.status }
                                : { data: table === 'sub_slot' ? [...db.sub].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 1) : db.parts.map((r) => ({ ...r })), error: null, status: 200 };
                            return Promise.resolve(out).then(res, rej);
                        },
                    };
                    return q as unknown as PollQuery;
                },
            };
        },
        auth: {
            onAuthStateChange(cb) { authCb = cb; return { data: { subscription: { unsubscribe } } }; },
        },
    };
    return { db, client, queries, unsubscribe, emit: (event: string, session: unknown) => authCb?.(event, session) };
}

/** 손으로 돌리는 타이머 — 시간 대신 「바퀴」를 센다. */
function manualTimer() {
    const pending = new Map<number, () => void>();
    let id = 0;
    return {
        setTimer: (fn: () => void) => { pending.set(++id, fn); return id; },
        clearTimer: (h: unknown) => { pending.delete(h as number); },
        get size() { return pending.size; },
    };
}

const CONFIG = { supabaseUrl: 'https://example.supabase.co', anonKey: 'example-anon-key' };

describe('미설정 — 서버 없이 조용히', () => {
    it('url·key 중 하나라도 비면 unconfigured · 클라이언트를 안 만든다 · 폴링 null', async () => {
        for (const c of [undefined, {}, { supabaseUrl: '', anonKey: 'k' }, { supabaseUrl: 'https://x', anonKey: '  ' }]) {
            const makeClient = vi.fn();
            const link = createServerLink(c, { makeClient });
            expect(link.status()).toBe('unconfigured');
            await link.start();
            expect(makeClient).not.toHaveBeenCalled();
            expect(link.status()).toBe('unconfigured');
            expect(link.client()).toBeNull();
            expect(link.startPolling({ projectId: 'p', onSubChanged: () => {} })).toBeNull();
        }
        expect(isConfigured(CONFIG)).toBe(true);
    });

    it('설정이 있으면 클라이언트를 한 번만 만들고 세션 알림대로 상태가 바뀐다', async () => {
        const s = fakeServer();
        const makeClient = vi.fn(async () => s.client);
        const link = createServerLink(CONFIG, { makeClient });
        expect(link.status()).toBe('loading');
        await Promise.all([link.start(), link.start()]);
        expect(makeClient).toHaveBeenCalledTimes(1);
        expect(makeClient).toHaveBeenCalledWith(CONFIG.supabaseUrl, CONFIG.anonKey);
        expect(link.status()).toBe('signed-out');
        const seen: string[] = [];
        link.onChange((st) => seen.push(st));
        s.emit('INITIAL_SESSION', { user: { id: 'u' } });
        expect(link.status()).toBe('signed-in');
        s.emit('SIGNED_OUT', null);
        expect(seen).toEqual(['signed-in', 'signed-out']);
    });
});

describe('끊김 세 갈래', () => {
    it('네트워크 — 던져진 TypeError · FunctionsFetchError · PostgREST status 0', () => {
        expect(classifyFailure(new TypeError('Failed to fetch')).kind).toBe('network');
        expect(classifyFailure(Object.assign(new Error('x'), { name: 'FunctionsFetchError' })).kind).toBe('network');
        expect(classifyFailure({ error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }).kind).toBe('network');
    });
    it('401 — 함수 오류 꼴 code 를 싣는다 · FunctionsHttpError(context=Response) 도', () => {
        expect(classifyFailure({ status: 401, body: { error: { code: 'unauthorized', message: '로그인이 필요합니다' } } }))
            .toEqual({ kind: 'unauthorized', status: 401, code: 'unauthorized', message: '로그인이 필요합니다' });
        expect(classifyFailure({ name: 'FunctionsHttpError', message: 'x', context: { status: 401 } }).kind).toBe('unauthorized');
        expect(classifyFailure({ error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 }).kind).toBe('unauthorized');
    });
    it('503 — 잠듦·복원 중', () => {
        expect(classifyFailure({ status: 503 }).kind).toBe('sleeping');
        expect(classifyFailure({ name: 'FunctionsHttpError', context: { status: 503 } }).kind).toBe('sleeping');
    });
    it('그 밖 HTTP 오류는 server — 세 갈래와 섞이지 않는다', () => {
        expect(classifyFailure({ status: 403, error: { code: 'not_member', message: 'm' } })).toMatchObject({ kind: 'server', code: 'not_member' });
        expect(classifyFailure({ status: 500 }).kind).toBe('server');
    });
});

describe('폴링 직행(② B17)', () => {
    it('바뀜 없으면 10분(20바퀴) 동안 함수 호출 0 · 직행 쿼리만 20번씩', async () => {
        const s = fakeServer();
        const onSub = vi.fn(); const onParts = vi.fn();
        const t = manualTimer();
        const p = createPoller({ projectId: 'p1', onSubChanged: onSub, onPartsChanged: onParts }, { client: s.client, ...t });
        for (let i = 0; i < (10 * 60_000) / POLL_INTERVAL_MS; i++) await p.tick();
        expect(onSub).not.toHaveBeenCalled();
        expect(onParts).not.toHaveBeenCalled();
        expect(s.queries.filter((q) => q === 'sub_slot:updated_at')).toHaveLength(20);
        expect(s.queries.filter((q) => q === 'parts:part, version')).toHaveLength(20);
        p.stop();
    });

    it('바뀌면 그 조각만 넘긴다 · 보결은 바뀐 시각과 함께 한 번', async () => {
        const s = fakeServer();
        const onSub = vi.fn(); const onParts = vi.fn();
        const p = createPoller({ projectId: 'p1', onSubChanged: onSub, onPartsChanged: onParts }, { client: s.client, ...manualTimer() });
        await p.tick();                                         // 기준
        s.db.parts[1].version = 4;                              // people 만
        s.db.parts.push({ part: 'bell', version: 1 });          // 새 조각
        await p.tick();
        expect(onParts).toHaveBeenCalledTimes(1);
        expect(onParts).toHaveBeenCalledWith(['people', 'bell']);
        expect(onSub).not.toHaveBeenCalled();
        s.db.sub.push({ updated_at: '2026-11-17T09:05:00Z' });
        await p.tick();
        expect(onSub).toHaveBeenCalledWith('2026-11-17T09:05:00Z');
        expect(onParts).toHaveBeenCalledTimes(1);
        await p.tick();
        expect(onSub).toHaveBeenCalledTimes(1);
    });

    it('known 을 주면 첫 바퀴부터 비교한다', async () => {
        const s = fakeServer();
        const onParts = vi.fn();
        const p = createPoller({ projectId: 'p1', onPartsChanged: onParts, known: { parts: { grid: 1, people: 2 } } }, { client: s.client, ...manualTimer() });
        await p.tick();
        expect(onParts).toHaveBeenCalledWith(['people']);
    });

    it('401 이면 멈추고 실패를 알린다 · 503 은 알리고 계속 돈다', async () => {
        const s = fakeServer();
        const fails: string[] = [];
        const t = manualTimer();
        const p = createPoller({ projectId: 'p1', onSubChanged: () => {}, onFailure: (f) => fails.push(f.kind) }, { client: s.client, ...t });
        s.db.error = { error: { message: 'Service Unavailable' }, status: 503 };
        await p.tick();
        expect(p.running).toBe(true);
        s.db.error = { error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 };
        await p.tick();
        expect(fails).toEqual(['sleeping', 'unauthorized']);
        expect(p.running).toBe(false);
        expect(t.size).toBe(0);
    });
});

describe('로그아웃·해제', () => {
    it('로그아웃되면 돌던 폴링이 멈추고 타이머가 빈다 · 로그아웃 상태에선 폴링을 안 연다', async () => {
        const s = fakeServer();
        const t = manualTimer();
        const link = createServerLink(CONFIG, { makeClient: async () => s.client, ...t });
        await link.start();
        expect(link.startPolling({ projectId: 'p1', onSubChanged: () => {} })).toBeNull();
        s.emit('SIGNED_IN', { user: { id: 'u' } });
        const h = link.startPolling({ projectId: 'p1', onSubChanged: () => {} });
        expect(h?.running).toBe(true);
        expect(t.size).toBe(1);
        s.emit('SIGNED_OUT', null);
        expect(h?.running).toBe(false);
        expect(t.size).toBe(0);
    });

    it('dispose 는 인증 구독을 풀고 폴링을 멈춘다 · 그 뒤 알림은 무시', async () => {
        const s = fakeServer();
        const link = createServerLink(CONFIG, { makeClient: async () => s.client, ...manualTimer() });
        await link.start();
        s.emit('SIGNED_IN', { user: { id: 'u' } });
        const h = link.startPolling({ projectId: 'p1', onPartsChanged: () => {} });
        link.dispose();
        expect(s.unsubscribe).toHaveBeenCalledTimes(1);
        expect(h?.running).toBe(false);
        s.emit('SIGNED_IN', { user: { id: 'u' } });
        expect(link.startPolling({ projectId: 'p1', onPartsChanged: () => {} })).toBeNull();
    });
});
