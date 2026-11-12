import { describe, it, expect } from 'vitest';
import { firstPaneForNarrow } from './mobile';

describe('firstPaneForNarrow', () => {
    it('보결 설치면 보결 첫 판', () => {
        expect(firstPaneForNarrow({ installed: ['rooms', 'substitute', 'v1-editor'] })).toEqual({ plugin: 'substitute', view: 'sheet' });
    });
    it('보결 없으면 v1-editor 를 뺀 첫 설치 판', () => {
        expect(firstPaneForNarrow({ installed: ['v1-editor', 'rooms', 'people'] })).toEqual({ plugin: 'rooms' });
    });
    it('아무것도 없으면 홈', () => {
        expect(firstPaneForNarrow({ installed: [] })).toBe('home');
    });
    it('v1-editor 만 설치면 홈', () => {
        expect(firstPaneForNarrow({ installed: ['v1-editor'] })).toBe('home');
    });
    it('설치 순서를 지킨다', () => {
        expect(firstPaneForNarrow({ installed: ['people', 'rooms'] })).toEqual({ plugin: 'people' });
    });
    it('has 가 거짓인 것은 건너뛴다', () => {
        expect(firstPaneForNarrow({ installed: ['substitute', 'rooms'], has: (id) => id !== 'substitute' })).toEqual({ plugin: 'rooms' });
    });
});
