/**
 * server-link 로컬 사본 (1.2v 설계 ① 11-1 · P5) — 끊김에 버티려고 칸(parts) 사본을 브라우저에 둔다.
 *   키 꼴 `bundle:<serverId>:<userId>:<projectId>` (serverId = Supabase ref · userId = auth.uid()) — 서버·사용자가 다르면 다른 사본이라 섞이지 않는다.
 *   값 = 칸마다 `{version, body}` + `dirty` 칸 목록 + 조작 큐(12절, P8 이 채운다).
 *   평문이라 공용 PC 에선 다음 사람이 볼 수 있다 → 로그아웃 때 `clearAll` 로 지운다(① 11-1 · 12절). dirty 가 있으면 막는 확인은 화면 몫(P7·P9).
 *   서버 호출 없음. 저장소는 주입식 — 기본은 IndexedDB, 시험은 메모리 어댑터.
 */

export interface PartCopy { version: number; body: unknown }
export interface Bundle {
    parts: Record<string, PartCopy>;
    dirty: string[];
    queue: unknown[];
}
export interface BundleId { serverId: string; userId: string; projectId: string }

/** 키 값 저장소 — 이 얇은 면만 알면 된다. */
export interface CacheStore {
    get(key: string): Promise<Bundle | undefined>;
    set(key: string, value: Bundle): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
}

const PREFIX = 'bundle:';

export function bundleKey(id: BundleId): string {
    for (const [name, v] of Object.entries(id)) {
        if (!v || v.includes(':')) throw new Error(`로컬 사본 키 조각 ${name} 이 비었거나 ':' 를 품었습니다`);
    }
    return `${PREFIX}${id.serverId}:${id.userId}:${id.projectId}`;
}

export const emptyBundle = (): Bundle => ({ parts: {}, dirty: [], queue: [] });

export function createCache(store: CacheStore) {
    const load = async (id: BundleId) => (await store.get(bundleKey(id))) ?? emptyBundle();
    return {
        read: (id: BundleId) => store.get(bundleKey(id)),
        /** 서버에서 받은 칸을 사본에 둔다(dirty 는 건드리지 않는다). */
        async writePart(id: BundleId, part: string, copy: PartCopy): Promise<void> {
            const b = await load(id);
            b.parts[part] = copy;
            await store.set(bundleKey(id), b);
        },
        /** 내가 고친 칸 — 사본에 두고 dirty 로 표시. */
        async markDirty(id: BundleId, part: string, copy: PartCopy): Promise<void> {
            const b = await load(id);
            b.parts[part] = copy;
            if (!b.dirty.includes(part)) b.dirty.push(part);
            await store.set(bundleKey(id), b);
        },
        /** PUT 이 200 이면 dirty 를 지운다. */
        async clearDirty(id: BundleId, part: string): Promise<void> {
            const b = await store.get(bundleKey(id));
            if (!b) return;
            b.dirty = b.dirty.filter(p => p !== part);
            await store.set(bundleKey(id), b);
        },
        async hasDirty(id: BundleId): Promise<boolean> {
            return ((await store.get(bundleKey(id)))?.dirty.length ?? 0) > 0;
        },
        remove: (id: BundleId) => store.delete(bundleKey(id)),
        /** 로그아웃 — 이 사용자의 사본만(같은 PC 의 다른 사용자 것은 남는다). */
        async clearUser(serverId: string, userId: string): Promise<void> {
            const head = `${PREFIX}${serverId}:${userId}:`;
            for (const k of await store.keys()) if (k.startsWith(head)) await store.delete(k);
        },
        /** 로그아웃 뒤 0 — 서버·사용자 가리지 않고 사본 키를 전부 지운다(공용 PC 기본값). */
        async clearAll(): Promise<void> {
            for (const k of await store.keys()) if (k.startsWith(PREFIX)) await store.delete(k);
        },
        keys: async () => (await store.keys()).filter(k => k.startsWith(PREFIX)),
    };
}

export type LocalCache = ReturnType<typeof createCache>;

export function memoryStore(): CacheStore {
    const m = new Map<string, Bundle>();
    return {
        get: async k => { const v = m.get(k); return v && structuredClone(v); },
        set: async (k, v) => { m.set(k, structuredClone(v)); },
        delete: async k => { m.delete(k); },
        keys: async () => [...m.keys()],
    };
}

const DB = 'timetable-server-link';
const OS = 'bundles';

/** 브라우저 IndexedDB 어댑터 — 쓸 때 처음 연다. */
export function idbStore(): CacheStore {
    let db: Promise<IDBDatabase> | undefined;
    const open = () => db ??= new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(OS);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
    const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
        const d = await open();
        return new Promise<T>((res, rej) => {
            const req = f(d.transaction(OS, mode).objectStore(OS));
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    };
    return {
        get: k => run('readonly', s => s.get(k) as IDBRequest<Bundle | undefined>),
        set: async (k, v) => { await run('readwrite', s => s.put(v, k)); },
        delete: async k => { await run('readwrite', s => s.delete(k)); },
        keys: async () => (await run('readonly', s => s.getAllKeys())).map(String),
    };
}

/** 앱이 쓰는 기본 사본 — 로그아웃 경로(Supabase Auth signOut 을 감싸는 server-link auth)가 `clearAll()` 을 부른다. */
export const localCache: LocalCache = createCache(idbStore());
