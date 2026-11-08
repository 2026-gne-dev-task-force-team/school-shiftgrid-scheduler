/**
 * 조립기 검산 — needs 위상 · conflicts 던짐 · 순환 던짐 · 알 수 없는 id 던짐.
 *   ⭐ 「조립 충돌이 던진다」가 M1 끝 조건이라, 던지는 길을 여기서 못 박는다.
 */
import { describe, expect, it } from 'vitest';
import { resolveFeatures } from './assemble';
import { BUILTIN } from './modules';
import type { TableFeature } from '../../contract-table/types';

const lookup = (id: string) => BUILTIN[id];
const ids = (fs: TableFeature[]) => fs.map((f) => f.id);

describe('조립기 — 푼다·정렬한다·던진다', () => {
    it('기본 묶음은 그대로 풀린다', () => {
        const out = resolveFeatures(['rows', 'fill', 'paste-policy:append', 'history'], lookup);
        expect(ids(out).sort()).toEqual(['fill', 'history', 'paste-policy:append', 'rows']);
    });

    it('알 수 없는 id 는 던진다', () => {
        expect(() => resolveFeatures(['rows', 'no-such'], lookup)).toThrow(/찾을 수 없다/);
    });

    it('🔴 붙여넣기 정책 둘(append·clip)을 같이 주면 던진다(conflicts)', () => {
        expect(() => resolveFeatures(['paste-policy:append', 'paste-policy:clip'], lookup)).toThrow(/같이 쓸 수 없다/);
    });

    it('needs 가 빠지면 던진다', () => {
        const child: TableFeature = { id: 'child', version: '0.1.0', needs: ['parent'], install: () => {} };
        expect(() => resolveFeatures([child], () => undefined)).toThrow(/needs/);
    });

    it('needs 가 있으면 의존을 먼저 설치하도록 정렬한다', () => {
        const parent: TableFeature = { id: 'parent', version: '0.1.0', install: () => {} };
        const child: TableFeature = { id: 'child', version: '0.1.0', needs: ['parent'], install: () => {} };
        const out = ids(resolveFeatures([child, parent], (id) => (id === 'parent' ? parent : undefined)));
        expect(out.indexOf('parent')).toBeLessThan(out.indexOf('child'));
    });

    it('순환 의존은 던진다', () => {
        const a: TableFeature = { id: 'a', version: '0.1.0', needs: ['b'], install: () => {} };
        const b: TableFeature = { id: 'b', version: '0.1.0', needs: ['a'], install: () => {} };
        const reg: Record<string, TableFeature> = { a, b };
        expect(() => resolveFeatures([a, b], (id) => reg[id])).toThrow(/순환/);
    });

    it('같은 id 를 두 번 주면 한 번만 센다', () => {
        const out = resolveFeatures(['rows', 'rows', 'fill'], lookup);
        expect(ids(out).sort()).toEqual(['fill', 'rows']);
    });
});
