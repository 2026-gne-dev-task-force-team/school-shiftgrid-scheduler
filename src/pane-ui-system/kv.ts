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
import { reportStorageError, classifyStorageError } from './plugin/storage-errors';

const STORE = 'kv';
const SCOPE = 'kv';

/** DB 이름 — 접두사에서 파생(setStoragePrefix 가 준 접두사). 모듈 로드가 아니라 열 때 읽는다(접두사가 먼저 와야 하니). */
const dbName = () => storageKey(STORE);

// 🔴 지연·단일 — 모듈 전역 Promise 하나를 재사용한다. 열기 실패/없음도 받아들여 null 로 떨어진다(던지지 않는다).
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
        try {
            if (typeof indexedDB === 'undefined') { resolve(null); return; }
            const req = indexedDB.open(dbName(), 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);     // 열기 거부 — 없는 것으로
            req.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
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
 * 쓰기 — 실패는 던지지 않고 reportStorageError 로 보고한다(부르는 쪽은 await 만, 성공/실패 분기는 안 해도 된다).
 *   - 열기 거부/없음 → 'blocked'
 *   - put() 동기 던짐(DataCloneError 등) / 트랜잭션 실패 → 에러를 사유로 가른다(quota/unknown)
 */
export async function kvSet(key: string, value: unknown): Promise<void> {
    const db = await openDb();
    if (!db) {
        reportStorageError({ scope: SCOPE, key, reason: 'blocked', at: Date.now() });
        return;
    }
    return new Promise<void>((resolve) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        const fail = (err: unknown) => {
            reportStorageError({ scope: SCOPE, key, reason: classifyStorageError(err), at: Date.now() });
            done();
        };
        try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(value, key);   // 🔴 담기지 않는 값이면 여기서 동기로 던진다(아래 catch)
            tx.oncomplete = () => done();
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

/** 🔴 테스트 전용 — 모듈 전역 DB 핸들을 비운다(환경이 바뀌는 테스트가 다시 열게). 프로덕션 경로는 안 부른다. */
export function __resetKvForTest(): void { dbPromise = null; }
