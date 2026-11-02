/**
 * 상태바 저장 칸의 우선순위 판정 — 🔴 순수 함수 한 장(StorageErrorStatus 와 호스트 앱이 같이 쓴다).
 *   컴포넌트 파일에서 분리한 이유는 fast-refresh(컴포넌트만 export) 규칙 때문이자, React 없이 검사하기 위해서다.
 */
import type { StorageDurability } from '../../plugin/storage-errors';

/** 비출 종류 — 한 번에 하나만. null 이면 평시(아무것도 안 보인다). */
export type StorageStatusKind = 'fail' | 'unavailable' | 'best-effort' | null;

/** 🔴 우선순위: 실패 > unavailable > best-effort > 숨김. */
export function storageStatusKind(failCount: number, durability: StorageDurability): StorageStatusKind {
    if (failCount > 0) return 'fail';
    if (durability === 'unavailable') return 'unavailable';
    if (durability === 'best-effort') return 'best-effort';
    return null;   // persisted · unknown — 평시 아무것도 안 보인다
}
