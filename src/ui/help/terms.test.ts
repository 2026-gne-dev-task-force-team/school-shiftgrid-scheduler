import { describe, expect, it } from 'vitest';
import { L } from './terms';

// T-10cl · R104 — 교사 탭 이름은 화면 표기만 바뀐다. 파일에 저장되는 역할 값 '비교과' 는 그대로.
describe('교사 탭 이름(R104)', () => {
    it('탭 이름은 「전담·강사」', () => {
        expect(L.agentTab).toBe('전담·강사');
    });
    it('저장 값(역할)은 그대로', () => {
        expect(L.roles.nonSubject).toBe('비교과');
        expect(L.agent).toBe('교사');
    });
});
