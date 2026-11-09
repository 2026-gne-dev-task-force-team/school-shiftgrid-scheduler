/**
 * 저장 실패 신호 — 창틀이 한 곳에서 모은다(지금까지 조용히 삼키던 자리를 전부 여기로 돌린다).
 *
 * 🔴 ⭐ 왜 있나: 저장(localStorage·IndexedDB)이 넘치거나 막히면 지금껏 catch 로 삼켜서 「경고도 없이
 *    저장만 멈추고」 새로고침하면 그 뒤 작업이 사라졌다. 그걸 못 하게, 실패를 부작용 없이 모아 두고
 *    상태바가 비춘다(여전히 throw 하지는 않는다 — 부르는 쪽이 전부 동기라 터지면 UI 가 죽는다).
 *
 * 🔴 ⛔ 도메인 0 · 색 0 — 여기는 「무엇이 왜 저장에 실패했나」만 쥔다(구조 검사 ⑤).
 */
import { useSyncExternalStore } from 'react';
import { notify } from './notify';

/**
 * 왜 실패했나 — quota(공간 참) · blocked(브라우저가 막음) · unknown(그 밖)
 *   · blocked-upgrade(다른 탭이 옛 버전 DB 를 열고 있어 판올림을 못 함 — 열기 거부와 구별한다)
 */
export type StorageErrorReason = 'quota' | 'blocked' | 'blocked-upgrade' | 'unknown';

/** 저장 실패 한 건 — 어느 저장소(scope)의 어느 키(key)가 왜(reason) 언제(at) 실패했나 */
export interface StorageError {
    scope: string;
    key: string;
    reason: StorageErrorReason;
    at: number;
}

/**
 * 🔴 에러 객체를 사유로 가른다 — QuotaExceededError(이름 또는 code 22)면 'quota', 그 밖은 'unknown'.
 *   (blocked 는 저장소 열기가 아예 거부된 자리에서만 직접 넣는다 — 에러 객체로 안 온다.)
 *   host.ts 의 localStorage catch 와 kv.ts 의 IndexedDB 실패가 둘 다 이걸 쓴다(한 자리에서 판정).
 */
export function classifyStorageError(err: unknown): StorageErrorReason {
    const e = err as { name?: string; code?: number } | null | undefined;
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) return 'quota';
    return 'unknown';
}

/** 실패 사유를 사람 말로 — 상태바 쪽지와 알림이 같은 문장을 쓴다 */
export function storageReasonText(reason: StorageErrorReason): string {
    switch (reason) {
        case 'quota': return '저장 공간이 찼다 — 저장되지 않았다. 새로고침하면 최근 변경이 사라진다';
        case 'blocked': return '브라우저가 저장을 막았다(프라이빗 모드일 수 있다)';
        case 'blocked-upgrade': return '다른 탭이 열려 있어 저장소를 올리지 못했다 — 다른 탭을 닫고 새로고침';
        default: return '알 수 없는 이유로 저장에 실패했다';
    }
}

// ── 스토어 — 키별 마지막 하나만(같은 키가 반복 실패해도 안 쌓인다), 최대 20건 ──
const MAX = 20;
const errors = new Map<string, StorageError>();   // key: scope \0 key — 가장 오래된 것이 맨 앞
let cache: StorageError[] | null = null;
const listeners = new Set<() => void>();

function emit(): void { cache = null; for (const l of listeners) l(); }

/**
 * 저장 실패를 보고한다 — 같은 (scope,key) 는 마지막 하나로 덮고, 전체가 MAX 를 넘으면 가장 오래된 것을 버린다.
 *   ⚠️ 덮을 때는 자리를 바꾸지 않는다(오래된 키가 계속 맨 앞) — 반복 실패가 목록을 무한히 늘리지 않게.
 */
export function reportStorageError(e: StorageError): void {
    const id = `${e.scope}\u0000${e.key}`;
    errors.delete(id);           // 늘 맨 뒤(최신)로 — 그래야 MAX 초과 때 진짜 오래된 것이 먼저 나간다
    errors.set(id, e);
    while (errors.size > MAX) {
        const oldest = errors.keys().next().value;
        if (oldest === undefined) break;
        errors.delete(oldest);
    }
    emit();
    // 🔔 알림으로도 알린다(오류는 닫을 때까지) — 같은 저장 자리의 반복 실패는 key 로 한 건에 덮인다
    notify('frame', { level: 'error', title: '저장 실패', body: storageReasonText(e.reason), key: id });
}

/** 한 자리(scope,key)의 실패만 지운다 — 재시도가 성공했을 때 */
export function clearStorageError(scope: string, key: string): void {
    if (errors.delete(`${scope}\u0000${key}`)) emit();
}

/** 전부 지운다(상태바의 「지우기」) */
export function clearStorageErrors(): void {
    if (errors.size === 0) return;
    errors.clear();
    emit();
}

function snapshot(): StorageError[] {
    if (!cache) cache = [...errors.values()];
    return cache;
}

/** 비(非)React 조회 — 테스트·호스트용 */
export function listStorageErrors(): StorageError[] { return snapshot(); }

/** React 구독 — 실패가 생기거나 지워지면 다시 그린다 */
export function useStorageErrors(): StorageError[] {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        snapshot,
        snapshot,
    );
}

// ── 내구성 신호 ──────────────────────────────────────────────
// 🔴 저장 실패 목록과 섞지 않는다 — 별 스토어·별 리스너. 실패는 「저장이 안 됐다」,
//    내구성은 「언젠가 지워질 수 있다」로 다른 것이다(섞으면 "저장 실패 N건"이 거짓이 된다).
//   unknown    — 아직 안 쟀다(저장을 쓰는 플러그인이 없으면 계속 여기 — 평시 경고 0)
//   persisted  — navigator.storage.persist() 로 영속이 보장됐다
//   best-effort— 열리긴 하나 브라우저가 공간 필요 시 지울 수 있다(persist 거부·모름)
//   unavailable— IndexedDB 가 아예 안 열린다(프라이빗·정책)

/** 저장이 얼마나 오래 살아남나 — kv 가 openDb 직후 한 번 재서 setDurability 로 신호를 보낸다. */
export type StorageDurability = 'unknown' | 'persisted' | 'best-effort' | 'unavailable';

let durability: StorageDurability = 'unknown';
const durabilityListeners = new Set<() => void>();

/** kv 가 부른다 — 내구성 신호를 세운다(바뀔 때만 다시 그린다). */
export function setDurability(d: StorageDurability): void {
    if (durability === d) return;
    durability = d;
    for (const l of durabilityListeners) l();
}

/** 비(非)React 조회 — 테스트용 */
export function getDurability(): StorageDurability { return durability; }

/** React 구독 — 내구성이 바뀌면 다시 그린다 */
export function useDurability(): StorageDurability {
    return useSyncExternalStore(
        (l) => { durabilityListeners.add(l); return () => { durabilityListeners.delete(l); }; },
        () => durability,
        () => durability,
    );
}
