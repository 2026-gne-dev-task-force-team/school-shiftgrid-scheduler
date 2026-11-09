/**
 * kv(IndexedDB 래퍼) + 저장 실패 신호 테스트.
 *
 * ⚠️ 테스트 환경은 node 라 indexedDB·localStorage 가 없다 — 그 「없는 환경」이 바로 사파리 프라이빗·
 *    기업 정책에서 열기가 거부되는 경로와 같은 분기다(던지지 않고 기능을 끈다).
 * 🔴 모듈 전역 스토어라 테스트끼리 안 번지게 각 테스트 전에 clearStorageErrors.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { kvGet, kvSet, kvAvailable, nodesGetAll, nodesWrite, __resetKvForTest } from './kv';
import {
    reportStorageError, clearStorageErrors, listStorageErrors, classifyStorageError,
    getDurability,
} from './plugin/storage-errors';
import { makeHost } from './plugin/host';
import { disposeOwner } from './plugin/store';
import { uid } from '../plugins/explorer/model/tree';

beforeEach(() => { clearStorageErrors(); __resetKvForTest(); });

describe('kv — indexedDB 없는 환경(node)에서 던지지 않고 기능을 끈다', () => {
    it('kvAvailable 은 false', async () => {
        expect(await kvAvailable()).toBe(false);
    });

    it('kvGet 은 null 을 돌려준다(던지지 않음)', async () => {
        expect(await kvGet('어떤키')).toBeNull();
    });

    it('kvSet 은 던지지 않고 실패에 false 를 돌려주며 reason: blocked 로 보고한다', async () => {
        await expect(kvSet('k1', { a: 1 })).resolves.toBe(false);   // 🔴 실패 → false(던지지 않는다)
        const errs = listStorageErrors();
        expect(errs).toHaveLength(1);
        expect(errs[0]).toMatchObject({ scope: 'kv', key: 'k1', reason: 'blocked' });
    });
});

describe('내구성 판정 — openDb 직후 setDurability 로 신호를 보낸다(user agent 스니핑 0)', () => {
    // 🔴 kv.ts 는 bare `indexedDB`·`navigator` 를 읽으니 globalThis 에 끼운다. 셋 다 끝나면 되돌린다.
    let savedIdb: unknown;
    let savedNav: PropertyDescriptor | undefined;

    function stubIdbOk() {
        savedIdb = (globalThis as { indexedDB?: unknown }).indexedDB;
        (globalThis as { indexedDB?: unknown }).indexedDB = {
            open: () => {
                const req: {
                    result: unknown;
                    onsuccess?: () => void; onerror?: () => void;
                    onupgradeneeded?: () => void; onblocked?: () => void;
                } = { result: { objectStoreNames: { contains: () => true } } };
                setTimeout(() => req.onsuccess?.(), 0);   // 비동기 성공 — open() 이 핸들러를 다는 뒤에
                return req;
            },
        };
    }
    function stubNavStorage(storage: unknown) {
        savedNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
        Object.defineProperty(globalThis, 'navigator', { value: { storage }, configurable: true, writable: true });
    }

    afterEach(() => {
        if (savedIdb === undefined) delete (globalThis as { indexedDB?: unknown }).indexedDB;
        else (globalThis as { indexedDB?: unknown }).indexedDB = savedIdb;
        savedIdb = undefined;
        if (savedNav) { Object.defineProperty(globalThis, 'navigator', savedNav); savedNav = undefined; }
        else { delete (globalThis as { navigator?: unknown }).navigator; }
    });

    it("persisted() 가 true 면 'persisted'", async () => {
        stubIdbOk();
        stubNavStorage({ persisted: async () => true, persist: async () => false });
        await kvAvailable();
        expect(getDurability()).toBe('persisted');
    });

    it("persisted()=false·persist()=false 면 'best-effort'", async () => {
        stubIdbOk();
        stubNavStorage({ persisted: async () => false, persist: async () => false });
        await kvAvailable();
        expect(getDurability()).toBe('best-effort');
    });

    it("IndexedDB 가 안 열리면 'unavailable'(db 가 null — navigator 를 보기 전에 가른다)", async () => {
        // indexedDB 를 지운 채(node 기본) 연다 → openDb 가 null → 'unavailable'
        savedIdb = (globalThis as { indexedDB?: unknown }).indexedDB;
        delete (globalThis as { indexedDB?: unknown }).indexedDB;
        await kvAvailable();
        expect(getDurability()).toBe('unavailable');
    });
});

describe('classifyStorageError — quota 판정이 QuotaExceededError 를 맞게 가른다', () => {
    it('name 이 QuotaExceededError 면 quota', () => {
        expect(classifyStorageError({ name: 'QuotaExceededError' })).toBe('quota');
    });
    it('code 가 22 면 quota(옛 브라우저)', () => {
        expect(classifyStorageError({ code: 22 })).toBe('quota');
    });
    it('그 밖(DataCloneError·일반 에러·null)은 unknown', () => {
        expect(classifyStorageError({ name: 'DataCloneError' })).toBe('unknown');
        expect(classifyStorageError(new Error('anything'))).toBe('unknown');
        expect(classifyStorageError(null)).toBe('unknown');
        expect(classifyStorageError(undefined)).toBe('unknown');
    });
});

describe('저장 실패 스토어 — 키별 마지막 하나만, 최대 20건', () => {
    it('같은 (scope,key) 를 다시 보고하면 덮는다(목록이 안 늘고 사유는 최신)', () => {
        reportStorageError({ scope: 'kv', key: 'same', reason: 'unknown', at: 1 });
        reportStorageError({ scope: 'kv', key: 'same', reason: 'quota', at: 2 });
        const errs = listStorageErrors();
        expect(errs).toHaveLength(1);
        expect(errs[0]).toMatchObject({ key: 'same', reason: 'quota', at: 2 });
    });

    it('scope 가 다르면 같은 키라도 따로 센다', () => {
        reportStorageError({ scope: 'kv', key: 'k', reason: 'quota', at: 1 });
        reportStorageError({ scope: 'local', key: 'k', reason: 'quota', at: 1 });
        expect(listStorageErrors()).toHaveLength(2);
    });

    it('21개를 서로 다른 키로 보고하면 20건으로 깎이고 가장 오래된 것이 나간다', () => {
        for (let i = 0; i < 21; i++) reportStorageError({ scope: 'kv', key: `k${i}`, reason: 'quota', at: i });
        const errs = listStorageErrors();
        expect(errs).toHaveLength(20);
        expect(errs.find((e) => e.key === 'k0')).toBeUndefined();   // 가장 오래된 k0 이 빠졌다
        expect(errs.find((e) => e.key === 'k20')).toBeTruthy();     // 최신 k20 은 남았다
    });

    it('clearStorageErrors 가 전부 지운다', () => {
        reportStorageError({ scope: 'kv', key: 'k', reason: 'quota', at: 1 });
        clearStorageErrors();
        expect(listStorageErrors()).toHaveLength(0);
    });
});

/**
 * 노드 스토어(nodesGetAll/nodesWrite) — node 엔 indexedDB 가 없으니 작은 가짜 IDB 를 끼운다(kv.test 의 stub 과 같은 결).
 *   🔴 이벤트 모델을 흉내 낸다: 작업은 동기로 Map 에 반영하고, oncomplete·onsuccess 는 microtask 로(핸들러가 달린 뒤에).
 */
function fakeIndexedDB() {
    const stores = new Map<string, { keyPath?: string; data: Map<unknown, unknown> }>();
    let version = 0;
    return {
        _stores: stores,
        open(_name: string, v: number) {
            const req: {
                result?: unknown;
                onsuccess?: () => void; onerror?: () => void;
                onupgradeneeded?: () => void; onblocked?: () => void;
            } = {};
            queueMicrotask(() => {
                const db = {
                    objectStoreNames: { contains: (n: string) => stores.has(n) },
                    createObjectStore: (n: string, opts?: { keyPath?: string }) => {
                        stores.set(n, { keyPath: opts?.keyPath, data: new Map() });
                        return {};
                    },
                    transaction: (storeName: string) => {
                        const store = stores.get(storeName)!;
                        const tx: { objectStore: () => unknown; oncomplete?: () => void; onerror?: () => void; onabort?: () => void; error?: unknown } = {
                            objectStore: () => ({
                                put: (val: Record<string, unknown>) => { store.data.set(store.keyPath ? val[store.keyPath] : val, val); },
                                delete: (key: unknown) => { store.data.delete(key); },
                                clear: () => { store.data.clear(); },
                                getAll: () => {
                                    const r: { result?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
                                    queueMicrotask(() => { r.result = [...store.data.values()]; r.onsuccess?.(); });
                                    return r;
                                },
                            }),
                        };
                        queueMicrotask(() => { tx.oncomplete?.(); });   // 동기 작업이 다 큐에 든 뒤에 완료
                        return tx;
                    },
                };
                req.result = db;
                if (v > version) { version = v; req.onupgradeneeded?.(); }
                req.onsuccess?.();
            });
            return req;
        },
    };
}

describe('노드 스토어 — nodesGetAll/nodesWrite(가짜 IDB · 한 트랜잭션)', () => {
    let savedIdb: unknown;
    beforeEach(() => {
        savedIdb = (globalThis as { indexedDB?: unknown }).indexedDB;
        (globalThis as { indexedDB?: unknown }).indexedDB = fakeIndexedDB();
        __resetKvForTest();
    });
    afterEach(() => {
        if (savedIdb === undefined) delete (globalThis as { indexedDB?: unknown }).indexedDB;
        else (globalThis as { indexedDB?: unknown }).indexedDB = savedIdb;
        savedIdb = undefined;
        __resetKvForTest();
    });

    it('put 한 것을 getAll 로 그대로 읽는다(빈 스토어는 [] — null 아님)', async () => {
        expect(await nodesGetAll()).toEqual([]);                      // 열렸고 비어 있음 → []
        expect(await nodesWrite({ put: [{ id: 'a', type: 'folder', name: '가' }] })).toBe(true);
        const all = await nodesGetAll();
        expect(all).toEqual([{ id: 'a', type: 'folder', name: '가' }]);
    });

    it('del 이 그 레코드만 지운다', async () => {
        await nodesWrite({ put: [{ id: 'a', name: '가' }, { id: 'b', name: '나' }] });
        expect(await nodesWrite({ del: ['a'] })).toBe(true);
        expect(await nodesGetAll()).toEqual([{ id: 'b', name: '나' }]);
    });

    it('clear + put 이 한 트랜잭션에 — 비우고 새로 쓴 것만 남는다', async () => {
        await nodesWrite({ put: [{ id: 'old1' }, { id: 'old2' }] });
        expect(await nodesWrite({ clear: true, put: [{ id: 'new1' }] })).toBe(true);
        expect(await nodesGetAll()).toEqual([{ id: 'new1' }]);
    });

    it("'__meta' 는 노드와 같은 스토어에 공존한다(레코드와 머리를 같이 담는다)", async () => {
        await nodesWrite({ put: [{ id: 'n1', name: '노드' }, { id: '__meta', root: 'root', trash: 'trash', rev: 3 }] });
        const all = (await nodesGetAll()) as { id: string }[];
        expect(all.find((r) => r.id === '__meta')).toMatchObject({ root: 'root', trash: 'trash', rev: 3 });
        expect(all.find((r) => r.id === 'n1')).toBeTruthy();
    });
});

describe('노드 스토어 — 열기 거부/판올림 막힘', () => {
    beforeEach(() => { __resetKvForTest(); });
    afterEach(() => { __resetKvForTest(); });

    it('indexedDB 가 없으면 nodesGetAll 은 null · nodesWrite 는 false + scope nodes 로 보고', async () => {
        expect(await nodesGetAll()).toBeNull();                       // 🔴 열기 거부/없음 = null(「비어 있음」[] 과 가른다)
        expect(await nodesWrite({ put: [{ id: 'x' }] })).toBe(false);
        const errs = listStorageErrors();
        expect(errs.some((e) => e.scope === 'nodes' && e.reason === 'blocked')).toBe(true);
    });

    it("onblocked 는 내구성을 unavailable 로 안 찍고 'blocked-upgrade' 로 보고한다", async () => {
        const savedIdb = (globalThis as { indexedDB?: unknown }).indexedDB;
        (globalThis as { indexedDB?: unknown }).indexedDB = {
            open: () => {
                const req: { onblocked?: () => void; onsuccess?: () => void; onerror?: () => void } = {};
                queueMicrotask(() => req.onblocked?.());
                return req;
            },
        };
        try {
            expect(await kvAvailable()).toBe(false);                   // 열리지 않았다
            expect(getDurability()).not.toBe('unavailable');          // 🔴 다른 탭 탓 — unavailable 아님
            const errs = listStorageErrors();
            expect(errs.some((e) => e.scope === 'nodes' && e.reason === 'blocked-upgrade')).toBe(true);
        } finally {
            if (savedIdb === undefined) delete (globalThis as { indexedDB?: unknown }).indexedDB;
            else (globalThis as { indexedDB?: unknown }).indexedDB = savedIdb;
        }
    });
});

describe("'__meta' 예약 id — uid() 는 절대 '__' 로 시작하지 않는다", () => {
    it('1000번 뽑아도 __ 접두사가 없다(노드 id 가 머리 레코드와 안 부딪힌다)', () => {
        for (let i = 0; i < 1000; i++) expect(uid().startsWith('__')).toBe(false);
    });
});

describe('host.storage.set — 넘치면 삼키지 않고 보고한다(scope: local)', () => {
    // localStorage 를 흉내 내 QuotaExceededError 를 던지게 한다
    const OWNER = 'tkv';
    let saved: unknown;
    afterEach(() => {
        disposeOwner(OWNER);
        if (saved === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
        else (globalThis as { localStorage?: unknown }).localStorage = saved;
    });

    function stubLocalStorage(throwOnSet: boolean) {
        saved = (globalThis as { localStorage?: unknown }).localStorage;
        (globalThis as { localStorage?: unknown }).localStorage = {
            getItem: () => null,
            setItem: () => {
                if (throwOnSet) {
                    const e = new Error('full');
                    (e as { name: string }).name = 'QuotaExceededError';
                    throw e;
                }
            },
            removeItem: () => { /* noop */ },
            clear: () => { /* noop */ },
        };
    }

    it('setItem 이 QuotaExceededError 를 던지면 reason: quota · scope: local 로 보고한다(throw 안 함)', () => {
        stubLocalStorage(true);
        const h = makeHost(OWNER);
        expect(() => h.storage.set('cfg', { x: 1 })).not.toThrow();
        const errs = listStorageErrors();
        expect(errs).toHaveLength(1);
        expect(errs[0].scope).toBe('local');
        expect(errs[0].reason).toBe('quota');
        expect(errs[0].key).toContain('plugin.tkv.cfg');   // skey 가 붙은 전체 키
    });

    it('정상 저장이면 아무것도 보고하지 않는다', () => {
        stubLocalStorage(false);
        const h = makeHost(OWNER);
        h.storage.set('cfg', { x: 1 });
        expect(listStorageErrors()).toHaveLength(0);
    });
});
