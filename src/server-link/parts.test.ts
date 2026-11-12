import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache, memoryStore } from './cache';
import { createPartQueue, PUT_DEBOUNCE_MS } from './parts';

type Reply = { status: number; etag?: string; body?: unknown } | 'throw';
interface Call { part: string; ifMatch: string | null; body: unknown }

function setup(replies: (call: Call, n: number) => Reply, withCache = false) {
    const calls: Call[] = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
        const call: Call = {
            part: decodeURIComponent(url.split('/parts/')[1]),
            ifMatch: new Headers(init.headers).get('If-Match'),
            body: JSON.parse(init.body as string),
        };
        calls.push(call);
        const r = replies(call, calls.length);
        if (r === 'throw') throw new TypeError('network');
        return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: r.etag ? { ETag: r.etag } : {} });
    });
    const id = { serverId: 's', userId: 'u', projectId: 'p' };
    const cache = createCache(memoryStore());
    const q = createPartQueue({ baseUrl: 'https://x/projects/p', fetch: f as unknown as typeof fetch, ...(withCache ? { cache, id } : {}) });
    return { q, calls, cache, id };
}
const ok = (v: number): Reply => ({ status: 200, etag: `"1.${v}"` });
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('칸 PUT 큐', () => {
    it('200 → ETag 갱신 · dirty 지움 · saved', async () => {
        const { q, calls, cache, id } = setup((_c, n) => ok(n + 1), true);
        q.seed('a', '"1.1"');
        q.edit('a', { v: 1 });
        await tick(0);
        expect(q.status()).toEqual({ kind: 'pending', count: 1 });
        expect((await cache.read(id))?.dirty).toEqual(['a']);
        await tick(PUT_DEBOUNCE_MS);
        await q.flush();
        expect(calls).toEqual([{ part: 'a', ifMatch: '"1.1"', body: { v: 1 } }]);
        expect(q.partInfo('a').etag).toBe('"1.2"');
        expect(q.status()).toEqual({ kind: 'saved' });
        const b = await cache.read(id);
        expect(b?.dirty).toEqual([]);
        expect(b?.parts.a).toEqual({ version: 2, body: { v: 1 } });
        q.edit('a', { v: 2 });
        await tick(PUT_DEBOUNCE_MS); await q.flush();
        expect(calls[1].ifMatch).toBe('"1.2"');
    });

    it('2초 안의 같은 칸 변경 셋 → PUT 1번(마지막 값)', async () => {
        const { q, calls } = setup((_c, n) => ok(n));
        q.seed('a', '"1.0"');
        q.edit('a', 1); await tick(500); q.edit('a', 2); await tick(500); q.edit('a', 3);
        await tick(999);
        expect(calls).toHaveLength(0);
        await tick(1);
        expect(calls).toHaveLength(1);
        expect(calls[0].body).toBe(3);
    });

    it('다른 칸 둘 → PUT 2번', async () => {
        const { q, calls } = setup((_c, n) => ok(n));
        q.edit('a', 1); q.edit('b', 2);
        await tick(PUT_DEBOUNCE_MS);
        expect(calls.map(c => c.part).sort()).toEqual(['a', 'b']);
    });

    it('412 → conflict · 그 칸 이후 변경은 안 보내고 다른 칸은 보낸다', async () => {
        const { q, calls } = setup(c => c.part === 'a' ? { status: 412, body: { server: 'theirs' } } : ok(5));
        q.seed('a', '"1.1"');
        q.edit('a', 1); q.edit('b', 1);
        await tick(PUT_DEBOUNCE_MS);
        expect(q.status()).toEqual({ kind: 'conflict', parts: ['a'] });
        expect(q.partInfo('a')).toMatchObject({ state: 'conflict', serverBody: { server: 'theirs' } });
        expect(calls).toHaveLength(2);
        q.edit('a', 2); q.edit('b', 2);
        await tick(PUT_DEBOUNCE_MS); await q.flush();
        expect(calls.filter(c => c.part === 'a')).toHaveLength(1);
        expect(calls.filter(c => c.part === 'b')).toHaveLength(2);
        expect(q.partInfo('b').state).toBe('clean');
    });

    it('428 → error · 재시도 없음 · 콘솔 경고', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { q, calls } = setup(() => ({ status: 428 }));
        q.edit('a', 1);
        await tick(PUT_DEBOUNCE_MS);
        await tick(10 * 60_000);
        expect(calls).toHaveLength(1);
        expect(q.status()).toEqual({ kind: 'error', parts: ['a'] });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('503 → 5·15·60초 재시도 후 200 이면 saved', async () => {
        const { q, calls } = setup((_c, n) => n <= 3 ? { status: 503 } : ok(9));
        q.seed('a', '"1.1"');
        q.edit('a', 1);
        await tick(PUT_DEBOUNCE_MS);
        expect(calls).toHaveLength(1);
        expect(q.status()).toEqual({ kind: 'offline', count: 1 });
        await tick(4999); expect(calls).toHaveLength(1);
        await tick(1); expect(calls).toHaveLength(2);
        await tick(14999); expect(calls).toHaveLength(2);
        await tick(1); expect(calls).toHaveLength(3);
        await tick(59999); expect(calls).toHaveLength(3);
        await tick(1); expect(calls).toHaveLength(4);
        expect(calls.every(c => c.ifMatch === '"1.1"')).toBe(true);
        expect(q.status()).toEqual({ kind: 'saved' });
    });

    it('네트워크 실패도 offline · 그다음 60초마다', async () => {
        const { q, calls } = setup((_c, n) => n <= 4 ? 'throw' : ok(1));
        q.edit('a', 1);
        await tick(PUT_DEBOUNCE_MS + 5000 + 15000 + 60000);
        expect(calls).toHaveLength(4);
        expect(q.status().kind).toBe('offline');
        await tick(60000);
        expect(calls).toHaveLength(5);
        expect(q.status()).toEqual({ kind: 'saved' });
    });

    it('401 → relogin · 재시도 멈춤 · resume 으로 다시', async () => {
        const { q, calls } = setup((_c, n) => n === 1 ? { status: 401 } : ok(2));
        q.edit('a', 1);
        await tick(PUT_DEBOUNCE_MS);
        await tick(10 * 60_000);
        expect(calls).toHaveLength(1);
        expect(q.status()).toEqual({ kind: 'relogin' });
        await q.resume();
        expect(calls).toHaveLength(2);
        expect(q.status()).toEqual({ kind: 'saved' });
    });

    it('flush 는 2초를 기다리지 않고 즉시 보낸다 · 구독이 상태 변화를 받는다', async () => {
        const { q, calls } = setup((_c, n) => ok(n));
        const seen: string[] = [];
        q.subscribe(() => seen.push(q.status().kind));
        q.edit('a', 1);
        await q.flush();
        expect(calls).toHaveLength(1);
        expect(q.status()).toEqual({ kind: 'saved' });
        expect(seen).toContain('pending');
        expect(seen).toContain('saving');
        expect(seen.at(-1)).toBe('saved');
        await tick(PUT_DEBOUNCE_MS);
        expect(calls).toHaveLength(1);
    });

    it('보내는 사이 또 고치면 새 판으로 한 번 더 보낸다', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const calls: (string | null)[] = [];
        const f = vi.fn(async (_u: string, init: RequestInit) => {
            calls.push(new Headers(init.headers).get('If-Match'));
            if (calls.length === 1) await gate;
            return new Response('{}', { status: 200, headers: { ETag: `"1.${calls.length + 1}"` } });
        });
        const q = createPartQueue({ baseUrl: 'https://x', fetch: f as unknown as typeof fetch });
        q.seed('a', '"1.1"');
        q.edit('a', 1);
        await tick(PUT_DEBOUNCE_MS);
        q.edit('a', 2);
        release();
        await tick(0);
        expect(q.partInfo('a').state).toBe('dirty');
        await tick(PUT_DEBOUNCE_MS);
        await q.flush();
        expect(calls).toEqual(['"1.1"', '"1.2"']);
        expect(q.status()).toEqual({ kind: 'saved' });
    });

    it('resolve server → 서버 값·ETag 로 맞추고 막힘이 풀려 다음 변경이 나간다', async () => {
        const { q, calls } = setup(c => c.part === 'a' && c.ifMatch === '"1.1"' ? { status: 412, body: { s: 1 } } : ok(4));
        q.seed('a', '"1.1"');
        q.edit('a', { mine: 1 });
        await tick(PUT_DEBOUNCE_MS);
        expect(q.partInfo('a').state).toBe('conflict');
        await q.resolve('a', { etag: '"1.3"', value: { s: 1 }, keep: 'server' });
        expect(q.partInfo('a')).toMatchObject({ state: 'clean', etag: '"1.3"' });
        expect(q.status()).toEqual({ kind: 'saved' });
        expect(calls).toHaveLength(1);
        q.edit('a', { next: 1 });
        await tick(PUT_DEBOUNCE_MS); await q.flush();
        expect(calls).toHaveLength(2);
        expect(calls[1]).toMatchObject({ ifMatch: '"1.3"', body: { next: 1 } });
    });

    it('resolve mine → 서버 ETag 로 내 값을 다시 PUT · 막힘이 풀린다', async () => {
        const { q, calls } = setup(c => c.ifMatch === '"1.1"' ? { status: 412, body: { s: 1 } } : ok(4));
        q.seed('a', '"1.1"');
        q.edit('a', { mine: 1 });
        await tick(PUT_DEBOUNCE_MS);
        await q.resolve('a', { etag: '"1.3"', value: { mine: 1 }, keep: 'mine' });
        expect(calls).toHaveLength(2);
        expect(calls[1]).toMatchObject({ ifMatch: '"1.3"', body: { mine: 1 } });
        expect(q.partInfo('a')).toMatchObject({ state: 'clean', etag: '"1.4"' });
        q.edit('a', { next: 1 });
        await tick(PUT_DEBOUNCE_MS); await q.flush();
        expect(calls).toHaveLength(3);
        expect(calls[2].ifMatch).toBe('"1.4"');
    });
});
