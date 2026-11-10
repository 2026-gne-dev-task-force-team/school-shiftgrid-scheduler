import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { announceWrite, watchOtherTabs, onOtherTabWrite, dispatchStorageEvent, __resetCrossTabForTest } from './cross-tab';
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

describe('탭 간 알림 — 무엇이 바뀌었나만 나른다(R3-X)', () => {
    beforeEach(() => { mem.clear(); FakeBC.all = []; __resetCrossTabForTest(); __resetNotifyForTest(); vi.stubGlobal('BroadcastChannel', FakeBC); });
    afterEach(() => { vi.unstubAllGlobals(); __resetCrossTabForTest(); });

    const other = (id: string, data: unknown) => { const o = new FakeBC('cross-tab:' + id); o.postMessage(data); };

    it('다른 탭의 노드 쓰기를 구독자에 넘긴다 — 경고 알림은 안 띄운다(동기화가 되니 새로고침이 필요 없다)', () => {
        const got: unknown[] = [];
        onOtherTabWrite((c) => got.push(c));
        watchOtherTabs('p1');
        other('p1', { projectId: 'p1', origin: 'x', kind: 'nodes', ids: ['n1'] });
        expect(got).toEqual([{ kind: 'nodes', ids: ['n1'] }]);
        expect(getNotifications().items).toHaveLength(0);
    });
    it('다른 프로젝트 id 면 넘기지 않는다', () => {
        const got: unknown[] = [];
        onOtherTabWrite((c) => got.push(c));
        watchOtherTabs('p1');
        other('p1', { projectId: 'p2', origin: 'x', kind: 'nodes', ids: ['n1'] });
        expect(got).toHaveLength(0);
    });
    it('announceWrite 는 채널에 프로젝트 id·바뀐 id 를 쏜다', () => {
        const got: Record<string, unknown>[] = [];
        const o = new FakeBC('cross-tab:p1'); o.onmessage = (e) => got.push(e.data);
        announceWrite('p1', { kind: 'nodes', ids: ['a', 'b'] });
        expect(got).toHaveLength(1);
        expect(got[0]).toMatchObject({ projectId: 'p1', kind: 'nodes', ids: ['a', 'b'] });
    });
    it('BroadcastChannel 이 없으면 localStorage 핑(storage 이벤트)으로 대신 나른다', () => {
        vi.unstubAllGlobals();
        vi.stubGlobal('BroadcastChannel', undefined);
        const got: unknown[] = [];
        onOtherTabWrite((c) => got.push(c));
        watchOtherTabs('p1');
        // 다른 탭이 핑을 썼다 — 브라우저가 이 탭에 storage 이벤트를 쏜 것을 흉내
        const raw = JSON.stringify({ projectId: 'p1', origin: 'other', kind: 'nodes', ids: ['z'], n: 1 });
        dispatchStorageEvent({ key: 'pane-ui-system.__cross-tab', newValue: raw });
        expect(got).toEqual([{ kind: 'nodes', ids: ['z'] }]);
    });
});
