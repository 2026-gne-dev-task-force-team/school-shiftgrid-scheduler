/**
 * 옛 기기 저장소(localStorage `plugin.ops-aux.part`) → 호스트 플러그인 저장(`host.storage` 의 `part`) 이사(R17 · T-10fo).
 *   🔴 옛 값은 지우지 않는다 — 「옮김」 표시(`part.moved`)만 호스트 저장에 쓴다. 표시는 일이 끝난 뒤(옮길 게 없어도) 쓴다.
 *   🔴 새 칸에 이미 값이 있으면 덮지 않는다(표시만 쓴다) — 두 번 돌려도 같다.
 *   옛 칸은 읽기만 한다(여기서 localStorage 에 쓰지 않는다).
 */
import type { AuxPart } from './types';
import { PART_KEY, readStoredPart, type PartStore } from './source';

export const LEGACY_KEY = 'plugin.ops-aux.part';
export const PART_MOVED_KEY = 'part.moved';
export interface PartMoveResult { moved: boolean; /** 이미 옮겨 둔 뒤라 아무것도 안 했다 */ done: boolean }

/** 옛 저장 값 — 없거나 깨졌으면 null. */
export function readLegacyPart(legacy: Pick<Storage, 'getItem'>, key: string = LEGACY_KEY): AuxPart | null {
    try {
        const raw = legacy.getItem(key);
        if (!raw) return null;
        const p = JSON.parse(raw) as AuxPart;
        return p && Array.isArray(p.staff) && Array.isArray(p.day) && Array.isArray(p.exceptions) ? p : null;
    } catch { return null; }
}

export function movePartToStorage(store: PartStore, legacy: Pick<Storage, 'getItem'>, key: string = LEGACY_KEY): PartMoveResult {
    if (store.get<unknown>(PART_MOVED_KEY, null) !== null) return { moved: false, done: true };
    let moved = false;
    if (!readStoredPart(store)) {
        const old = readLegacyPart(legacy, key);
        if (old) { store.set(PART_KEY, old); moved = true; }
    }
    store.set(PART_MOVED_KEY, { moved });
    return { moved, done: false };
}
