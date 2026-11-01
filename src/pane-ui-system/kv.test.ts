/**
 * kv(IndexedDB 래퍼) + 저장 실패 신호 테스트.
 *
 * ⚠️ 테스트 환경은 node 라 indexedDB·localStorage 가 없다 — 그 「없는 환경」이 바로 사파리 프라이빗·
 *    기업 정책에서 열기가 거부되는 경로와 같은 분기다(던지지 않고 기능을 끈다).
 * 🔴 모듈 전역 스토어라 테스트끼리 안 번지게 각 테스트 전에 clearStorageErrors.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { kvGet, kvSet, kvAvailable, __resetKvForTest } from './kv';
import {
    reportStorageError, clearStorageErrors, listStorageErrors, classifyStorageError,
} from './plugin/storage-errors';
import { makeHost } from './plugin/host';
import { disposeOwner } from './plugin/store';

beforeEach(() => { clearStorageErrors(); __resetKvForTest(); });

describe('kv — indexedDB 없는 환경(node)에서 던지지 않고 기능을 끈다', () => {
    it('kvAvailable 은 false', async () => {
        expect(await kvAvailable()).toBe(false);
    });

    it('kvGet 은 null 을 돌려준다(던지지 않음)', async () => {
        expect(await kvGet('어떤키')).toBeNull();
    });

    it('kvSet 은 던지지 않고 실패를 보고한다(reason: blocked)', async () => {
        await expect(kvSet('k1', { a: 1 })).resolves.toBeUndefined();   // 던지지 않는다
        const errs = listStorageErrors();
        expect(errs).toHaveLength(1);
        expect(errs[0]).toMatchObject({ scope: 'kv', key: 'k1', reason: 'blocked' });
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
