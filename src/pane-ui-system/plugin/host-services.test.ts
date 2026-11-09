import { describe, it, expect } from 'vitest';
import { HOST_SERVICES } from './host-services';

describe('HOST_SERVICES', () => {
    it('모든 칸에 이름·설명·예가 한 줄 이상 있다', () => {
        for (const [k, v] of Object.entries(HOST_SERVICES)) {
            expect(v.label.trim(), `${k}.label`).not.toBe('');
            expect(v.desc.trim(), `${k}.desc`).not.toBe('');
            expect(v.example.trim(), `${k}.example`).not.toBe('');
        }
    });
});
