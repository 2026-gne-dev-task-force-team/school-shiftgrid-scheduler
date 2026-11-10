import { describe, it, expect } from 'vitest';
import { makeHash, verifyHash } from './hash';

// 이미 저장된 해시와의 호환 고정값 — SHA-256("<salt>:<비번>") hex. 이 값이 바뀌면 저장된 비밀번호가 깨진다.
const FIXED = { salt: 'abcd', hash: '965a89eebdd56dd4f8fde05bf85155e2293d97aedbc1cf03c3a0057e66db8c41' };

describe('hash — 저장 해시 호환', () => {
    it('고정 벡터가 통과한다', async () => {
        expect(await verifyHash('test-pw', FIXED)).toBe(true);
        expect(await verifyHash('other', FIXED)).toBe(false);
    });
    it('만든 해시를 다시 검증한다 · 솔트 16바이트 hex', async () => {
        const h = await makeHash('test-pw');
        expect(h.salt).toMatch(/^[0-9a-f]{32}$/);
        expect(h.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(await verifyHash('test-pw', h)).toBe(true);
    });
});
