/**
 * 상태바 저장 칸의 우선순위 검사 — 🔴 한 번에 하나만 비춘다: 실패 > unavailable > best-effort > 숨김.
 *   순수 함수(storageStatusKind)라 React 없이 가린다(이 칸의 핵심 규칙이라 따로 못 박는다).
 */
import { describe, it, expect } from 'vitest';
import { storageStatusKind } from './storage-status';

describe('⑤ 상태바 우선순위 — 실패 > unavailable > best-effort > 숨김', () => {
    it('실패가 1건 이상이면 내구성이 무엇이든 fail', () => {
        expect(storageStatusKind(1, 'unavailable')).toBe('fail');
        expect(storageStatusKind(3, 'best-effort')).toBe('fail');
        expect(storageStatusKind(2, 'persisted')).toBe('fail');
        expect(storageStatusKind(1, 'unknown')).toBe('fail');
    });

    it('실패 0 · unavailable 이면 unavailable', () => {
        expect(storageStatusKind(0, 'unavailable')).toBe('unavailable');
    });

    it('실패 0 · best-effort 이면 best-effort', () => {
        expect(storageStatusKind(0, 'best-effort')).toBe('best-effort');
    });

    it('persisted·unknown 은 숨김(null) — 평시 아무것도 안 보인다', () => {
        expect(storageStatusKind(0, 'persisted')).toBeNull();
        expect(storageStatusKind(0, 'unknown')).toBeNull();
    });
});
