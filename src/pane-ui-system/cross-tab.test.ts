import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { announceWrite, watchOtherTabs, __resetCrossTabForTest } from './cross-tab';
import { getNotifications, __resetNotifyForTest } from './plugin/notify';

const mem = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null), setItem: (k: string, v: string) => { mem.set(k, String(v)); },
        removeItem: (k: string) => { mem.delete(k); }, clear: () => { mem.clear(); }, key: () => null, get length() { return mem.size; } } });
}

class FakeBC {
    static all: FakeBC[] = [];
    onmessage: ((e: MessageEvent) => void) | null = null;
    name: string;
    constructor(name: string) { this.name = name; FakeBC.all.push(this); }
    postMessage(d: unknown) { for (const o of FakeBC.all) if (o !== this && o.name === this.name) o.onmessage?.({ data: d } as MessageEvent); }
    close() { FakeBC.all = FakeBC.all.filter((x) => x !== this); }
}

describe('탭 간 경고', () => {
    beforeEach(() => { mem.clear(); FakeBC.all = []; __resetCrossTabForTest(); __resetNotifyForTest(); vi.stubGlobal('BroadcastChannel', FakeBC); });
    afterEach(() => { vi.unstubAllGlobals(); __resetCrossTabForTest(); });

    const other = (id: string, data: unknown) => { const o = new FakeBC('cross-tab:' + id); o.postMessage(data); };

    it('같은 id 를 다른 탭이 쓰면 한 번만 알린다', () => {
        watchOtherTabs('p1');
        other('p1', { projectId: 'p1' });
        other('p1', { projectId: 'p1' });
        expect(getNotifications().items).toHaveLength(1);
    });
    it('다른 id 면 알리지 않는다', () => {
        watchOtherTabs('p1');
        other('p1', { projectId: 'p2' });
        expect(getNotifications().items).toHaveLength(0);
    });
    it('announceWrite 는 채널에 id 를 쏜다', () => {
        const got: unknown[] = [];
        const o = new FakeBC('cross-tab:p1'); o.onmessage = (e) => got.push(e.data);
        announceWrite('p1');
        expect(got).toEqual([{ projectId: 'p1' }]);
    });
});
