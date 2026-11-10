/**
 * 큰 자료용 보관 — IndexedDB 래퍼 한 장. localStorage(host.storage)의 origin 당 5MB 천장을 피한다.
 *
 * 🔴 ⭐ 값을 JSON.stringify 하지 않는다 — IndexedDB 는 구조화 복제로 객체를 그대로 담는다(이 교체로 버는
 *    것의 절반이 이것이다). 단 담기지 않는 값(함수·Symbol 등)이 오면 put() 이 DataCloneError 를 던지니
 *    그건 실패로 보고한다(reportStorageError).
 *
 * 🔴 없거나(SSR·테스트 node) 열기가 거부되는(사파리 프라이빗·용량 0·기업 정책) 환경에서는 던지지 않고
 *    기능을 끈다 — kvGet 은 null, kvSet 은 실패를 보고한다. 다음 덩이의 탐색기는 kvAvailable() 로 미리
 *    물어 localStorage 로 버틸 수 있다.
 *
 * 🔴 ⛔ 앱 이름을 코드에 박지 않는다(구조 검사 ⑤) — DB 이름은 storageKey 에서 파생한다(localStorage 키와 같은 자리).
 */
import { storageKey } from './storage';
import { notify } from './plugin/notify';
import { announceWrite, watchOtherTabs } from './cross-tab';
import { reportStorageError, clearStorageError, classifyStorageError, setDurability } from './plugin/storage-errors';

const STORE = 'kv';
const SCOPE = 'kv';

/**
 * 🔴 노드 스토어 — 노드 하나 = 레코드 하나(keyPath 'id'). 나무 통째가 아니라 바뀐 노드만 쓴다.
 *    탐색기 persist.ts 만 부른다(host.store 를 안 거친다 — 구조 검사 ⑭ 예외). DB 버전 2 에서 생긴다.
 */
const NODES = 'nodes';
const NODES_SCOPE = 'nodes';
const DB_VERSION = 2;

/** DB 이름 — 접두사에서 파생(setStoragePrefix 가 준 접두사). 모듈 로드가 아니라 열 때 읽는다(접두사가 먼저 와야 하니). */
const dbName = () => storageKey(STORE);

// 🔴 지연·단일 — 모듈 전역 Promise 하나를 재사용한다. 열기 실패/없음도 받아들여 null 로 떨어진다(던지지 않는다).
let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * 🔴 내구성을 한 번 잰다 — openDb 가 처음 뚫릴 때만(모듈 로드 시점이 아니라). 그래서 저장을 쓰는 플러그인이
 *    없으면 재지도 않고 경고도 안 뜬다(옳은 동작).
 *    - db 가 null → 'unavailable'(아예 안 열린다)
 *    - persisted() 가 이미 true → 'persisted'
 *    - 아니면 persist() 를 불러 true → 'persisted' / false → 'best-effort'
 *    - navigator.storage 가 없으면 'best-effort'(모르니 보수적으로)
 *   ⛔ user agent 스니핑 0 — 브라우저 이름을 묻지 않고 「열리나·승인됐나」 조건으로만 가린다.
 */
async function measureDurability(db: IDBDatabase | null): Promise<void> {
    if (!db) { setDurability('unavailable'); return; }
    try {
        const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
        if (!s) { setDurability('best-effort'); return; }
        if (await s.persisted?.()) { setDurability('persisted'); return; }
        const granted = await s.persist?.();
        setDurability(granted ? 'persisted' : 'best-effort');
    } catch {
        setDurability('best-effort');
    }
}

function openDb(): Promise<IDBDatabase | null> {
    if (dbPromise) return dbPromise;
    // 🔴 onblocked 는 「다른 탭이 옛 버전을 열고 있어 판올림 불가」다 — 열기 거부(onerror)와 다른 사유다.
    //    열기 거부는 내구성 'unavailable'(저장 못 함)이지만, blocked 는 다른 탭을 닫으면 풀리니 그렇게 안 찍고
    //    별도 사유('blocked-upgrade')로 한 건 보고만 한다(상태바 한 줄). 그래서 closure 플래그로 갈라 둔다.
    let blocked = false;
    // 열기 → 성공 직후 내구성을 한 번 잰다(그 뒤 db 를 돌려준다). openDb 가 메모이즈돼 측정도 딱 한 번.
    const thisOpen: Promise<IDBDatabase | null> = dbPromise = new Promise<IDBDatabase | null>((resolve) => {
        try {
            if (typeof indexedDB === 'undefined') { resolve(null); return; }
            const req = indexedDB.open(dbName(), DB_VERSION);
            req.onupgradeneeded = () => {
                // 🔴 옛 DB(버전 1 · kv 하나)를 여는 기기도 깨지지 않게 — 없는 스토어만 만든다(멱등).
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
                if (!db.objectStoreNames.contains(NODES)) db.createObjectStore(NODES, { keyPath: 'id' });
            };
            req.onsuccess = () => {
                const db = req.result;
                // 🔴 새 버전 탭이 열리면 옛 탭은 연결을 닫아 판올림을 막지 않는다 + 새로고침 안내.
                db.onversionchange = () => {
                    db.close();
                    // 🔴 닫힌 연결을 메모로 쥐고 있으면 이후 쓰기가 전부 실패한다 — 비워서 다음 호출이 다시 연다.
                    if (dbPromise === thisOpen) dbPromise = null;
                    notify('app', { level: 'warn', key: 'db-versionchange', timeout: 0, title: '새 버전이 다른 탭에서 열렸습니다 — 새로고침' });
                };
                watchOtherTabs(dbName());
                resolve(db);
            };
            req.onerror = () => resolve(null);     // 열기 거부 — 없는 것으로
            req.onblocked = () => {
                blocked = true;
                reportStorageError({ scope: NODES_SCOPE, key: '__open', reason: 'blocked-upgrade', at: Date.now() });
                resolve(null);
            };
        } catch {
            resolve(null);
        }
    }).then(async (db) => {
        // blocked 면 내구성을 'unavailable' 로 찍지 않는다(다른 탭을 닫으면 열린다 — 이미 보고는 했다).
        if (blocked) return db;
        await measureDurability(db);
        return db;
    });
    return dbPromise;
}

/** IndexedDB 가 실제로 열리나 — 다음 덩이가 「kv 를 쓸 수 있나」를 미리 묻는다(열기 거부면 false). */
export async function kvAvailable(): Promise<boolean> {
    return (await openDb()) !== null;
}

/** 읽기 — 없거나 실패면 null(구조화 복제된 객체를 그대로 돌려준다, 역직렬화 없음). */
export async function kvGet<T>(key: string): Promise<T | null> {
    const db = await openDb();
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
        try {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
            req.onsuccess = () => resolve((req.result ?? null) as T | null);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

/**
 * 쓰기 — 🔴 성패를 돌려준다(성공 true · 실패 false). 실패는 던지지 않고 reportStorageError 로도 보고한다.
 *   부르는 쪽(persist 의 이사)은 이 boolean 으로 「원본을 지워도 되나」를 가른다.
 *   - 열기 거부/없음 → 'blocked' · false
 *   - put() 동기 던짐(DataCloneError 등) / 트랜잭션 실패 → 에러를 사유로 가른다(quota/unknown) · false
 */
export async function kvSet(key: string, value: unknown): Promise<boolean> {
    const db = await openDb();
    if (!db) {
        reportStorageError({ scope: SCOPE, key, reason: 'blocked', at: Date.now() });
        return false;
    }
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
        const fail = (err: unknown) => {
            reportStorageError({ scope: SCOPE, key, reason: classifyStorageError(err), at: Date.now() });
            done(false);
        };
        try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(value, key);   // 🔴 담기지 않는 값이면 여기서 동기로 던진다(아래 catch)
            tx.oncomplete = () => { announceWrite(dbName(), { kind: 'kv', key }); done(true); };
            tx.onerror = () => fail(tx.error);
            tx.onabort = () => fail(tx.error);
        } catch (err) {
            fail(err);
        }
    });
}

/** 지우기 — 실패해도 조용히(삭제 실패는 저장 유실이 아니다). */
export async function kvDel(key: string): Promise<void> {
    const db = await openDb();
    if (!db) return;
    return new Promise<void>((resolve) => {
        try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/** 쓴 양·천장 추정 — navigator.storage.estimate 를 감싼다(없으면 null). */
export async function kvEstimate(): Promise<{ usage: number; quota: number } | null> {
    try {
        if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
        const est = await navigator.storage.estimate();
        return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    } catch {
        return null;
    }
}

// ─────────────────────────── 노드 스토어(keyPath 'id') ───────────────────────────

/**
 * 노드 전부 — getAll(). 🔴 열기 거부/없음이면 null(「비어 있음」[] 과 가른다 — 부르는 쪽이 이사할지 말지 정한다).
 *   레코드는 구조화 복제로 그대로 담겨 그대로 나온다(역직렬화 없음). 실패도 null.
 */
export async function nodesGetAll(): Promise<unknown[] | null> {
    const db = await openDb();
    if (!db) return null;
    return new Promise<unknown[] | null>((resolve) => {
        try {
            const req = db.transaction(NODES, 'readonly').objectStore(NODES).getAll();
            req.onsuccess = () => resolve((req.result ?? []) as unknown[]);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

/** 🔴 영구삭제 묘비 — 노드 스토어에 `__tomb:<id>` 레코드로 산다. 이 id 는 다시는 put 되지 않는다(다른 탭이 되살리기 ⛔). */
export const TOMB_PREFIX = '__tomb:';
/** 🔴 테스트 전용 — 버그 심기용 스위치(묘비 검사를 끈다). 프로덕션 경로는 안 바꾼다. */
let tombGuard = true;
export function __setTombGuardForTest(on: boolean): void { tombGuard = on; }

/**
 * 한 트랜잭션에 묶어 쓴다 — 묘비 읽기 → clear(있으면) → put 전부 → delete 전부 → purge(삭제+묘비). 🔴 전부 한 readwrite 로(반쯤 써짐 없음).
 *   🔴 ⛔ 트랜잭션 안에서 await 금지 — 자동 커밋에 죽는다(요청 콜백 안에서 이어 큐에 넣고 oncomplete 를 기다린다).
 *   🔴 R3-X 묘비 — 묘비가 있는 id 의 put 은 버리고 onRejected 로 돌려준다(그 탭이 메모리에서도 치우게).
 *      clear 는 묘비까지 지우니 다시 심는다. purge 는 「영구삭제」 — 삭제 + 묘비(다른 탭의 낡은 사본이 되살리지 못한다).
 *   성패를 돌려준다(성공 true · 실패 false + reportStorageError, scope 'nodes'). put 값은 keyPath 'id' 라 key 를 따로 안 준다.
 *   성공하면 다른 탭에 바뀐 id 를 알린다(clear 면 'all').
 *   🔴 W-X2 merge — 주면 put 마다 저장소의 지금 레코드를 **같은 트랜잭션 안에서** 읽어 merge(내 값, 저장소 값)의
 *      결과를 쓴다(저장소에 없으면 내 값 그대로). 읽기와 쓰기 사이에 다른 탭이 끼어들 틈이 없다 — 탭이 닫히는 중의
 *      저장도 같은 길이다. ⛔ merge 는 동기 함수여야 한다(await 를 섞으면 트랜잭션이 닫힌다). 던지면 내 값을 쓴다.
 *      clear 와는 함께 안 돈다(전부 다시 쓰기엔 합칠 저장소 값이 없다).
 */
export async function nodesWrite(batch: {
    put?: object[]; del?: string[]; clear?: boolean; purge?: string[];
    onRejected?: (ids: string[]) => void;
    merge?: (mine: object, stored: unknown) => object;
}): Promise<boolean> {
    const db = await openDb();
    if (!db) {
        reportStorageError({ scope: NODES_SCOPE, key: '__batch', reason: 'blocked', at: Date.now() });
        return false;
    }
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
        const fail = (err: unknown) => {
            reportStorageError({ scope: NODES_SCOPE, key: '__batch', reason: classifyStorageError(err), at: Date.now() });
            done(false);
        };
        const changed: string[] = [];
        const rejected: string[] = [];
        try {
            const tx = db.transaction(NODES, 'readwrite');
            const os = tx.objectStore(NODES);
            const queue = (tombs: Set<string>, stored: Map<string, unknown>) => {
                try {
                    if (batch.clear) {
                        os.clear();                               // 먼저 비운다(전부 다시 쓰기)
                        for (const id of tombs) os.put({ id: TOMB_PREFIX + id, tomb: true });   // 묘비는 살린다
                    }
                    for (const mine of batch.put ?? []) {
                        const id = (mine as { id?: unknown }).id;
                        if (tombGuard && typeof id === 'string' && tombs.has(id)) { rejected.push(id); continue; }
                        let v = mine;
                        if (batch.merge && typeof id === 'string' && stored.has(id)) {
                            try { v = batch.merge(mine, stored.get(id)); } catch { v = mine; }
                        }
                        os.put(v);                                // 🔴 담기지 않는 값이면 여기서 동기로 던진다(아래 catch)
                        if (typeof id === 'string') changed.push(id);
                    }
                    for (const id of batch.del ?? []) { os.delete(id); changed.push(id); }
                    for (const id of batch.purge ?? []) {
                        os.delete(id);
                        os.put({ id: TOMB_PREFIX + id, tomb: true, at: Date.now() });
                        changed.push(id);
                    }
                } catch (err) {
                    try { tx.abort(); } catch { /* 이미 끝남 */ }
                    fail(err);
                }
            };
            // 묘비 키만 범위로 읽는다(노드 전부를 안 훑는다).
            const range = typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.bound(TOMB_PREFIX, TOMB_PREFIX + '\uffff') : undefined;
            const req = os.getAllKeys(range);
            req.onsuccess = () => {
                const tombs = new Set((req.result as IDBValidKey[]).map(String)
                    .filter((k) => k.startsWith(TOMB_PREFIX)).map((k) => k.slice(TOMB_PREFIX.length)));
                // 🔴 합칠 put 의 저장소 값 — 같은 트랜잭션에서 get 을 줄줄이 걸고 마지막 응답에서 쓰기를 큐에 넣는다(비동기 대기 없음).
                const stored = new Map<string, unknown>();
                const ids = batch.merge && !batch.clear
                    ? (batch.put ?? []).map((v) => (v as { id?: unknown }).id).filter((id): id is string => typeof id === 'string' && !tombs.has(id))
                    : [];
                let left = ids.length;
                if (left === 0) { queue(tombs, stored); return; }
                for (const id of ids) {
                    const g = os.get(id);
                    g.onsuccess = () => {
                        if (g.result !== undefined) stored.set(id, g.result);
                        if (--left === 0) queue(tombs, stored);
                    };
                }
            };
            tx.oncomplete = () => {
                clearStorageError(NODES_SCOPE, '__batch');
                announceWrite(dbName(), { kind: 'nodes', ids: batch.clear ? 'all' : changed });
                if (rejected.length > 0) { try { batch.onRejected?.(rejected); } catch { /* 부르는 쪽 사정 */ } }
                done(true);
            };
            tx.onerror = () => fail(tx.error);
            tx.onabort = () => fail(tx.error);
        } catch (err) {
            fail(err);
        }
    });
}

/** 🔴 테스트 전용 — 모듈 전역 DB 핸들과 내구성 신호를 비운다(환경이 바뀌는 테스트가 다시 재게). 프로덕션 경로는 안 부른다. */
export function __resetKvForTest(): void { dbPromise = null; setDurability('unknown'); }
