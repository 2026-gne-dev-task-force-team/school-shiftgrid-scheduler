import { describe, it, expect } from 'vitest';
import { bundleKey, createCache, memoryStore } from './cache';

const A = { serverId: 'refabc', userId: '11111111-aaaa', projectId: 'p1' };
const B = { ...A, userId: '22222222-bbbb' };

describe('server-link 로컬 사본', () => {
    it('키 꼴 스냅숏', () => {
        expect(bundleKey(A)).toMatchInlineSnapshot(`"bundle:refabc:11111111-aaaa:p1"`);
        expect(() => bundleKey({ ...A, projectId: 'a:b' })).toThrow();
        expect(() => bundleKey({ ...A, userId: '' })).toThrow();
    });
    it('두 사용자·두 서버가 섞이지 않는다', async () => {
        const c = createCache(memoryStore());
        await c.writePart(A, 'ops', { version: 1, body: 'a' });
        await c.writePart(B, 'ops', { version: 7, body: 'b' });
        await c.writePart({ ...A, serverId: 'other' }, 'ops', { version: 3, body: 'c' });
        expect((await c.read(A))?.parts.ops).toEqual({ version: 1, body: 'a' });
        expect((await c.read(B))?.parts.ops).toEqual({ version: 7, body: 'b' });
        await c.clearUser(A.serverId, A.userId);
        expect(await c.read(A)).toBeUndefined();
        expect(await c.read(B)).toBeDefined();
    });
    it('dirty 표시·해제', async () => {
        const c = createCache(memoryStore());
        await c.markDirty(A, 'ops', { version: 2, body: 'x' });
        await c.markDirty(A, 'ops', { version: 2, body: 'y' });
        expect((await c.read(A))?.dirty).toEqual(['ops']);
        expect(await c.hasDirty(A)).toBe(true);
        await c.clearDirty(A, 'ops');
        expect(await c.hasDirty(A)).toBe(false);
    });
    it('로그아웃 뒤 남은 키 0', async () => {
        const store = memoryStore();
        const c = createCache(store);
        await c.writePart(A, 'ops', { version: 1, body: 1 });
        await c.markDirty(B, 'aux', { version: 1, body: 2 });
        await store.set('other:key', { parts: {}, dirty: [], queue: [] });
        await c.clearAll();
        expect(await c.keys()).toEqual([]);
        expect(await store.keys()).toEqual(['other:key']);
    });
});
