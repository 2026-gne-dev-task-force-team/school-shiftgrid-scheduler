/**
 * 설치 검산 — 기본 묶음 설정 · 붙여넣기 정책 충돌 던짐 · 키맵 충돌 던짐 · 레지스트리.
 */
import { describe, expect, it } from 'vitest';
import { buildConfig } from './install';
import { lookupFeature, registerFeature } from './registry';
import { DEFAULT_FEATURES } from './modules';
import type { TableFeature, TableState } from '../contracts/table';

const S = (): TableState => ({ active: { r: 0, c: 0 }, anchor: { r: 0, c: 0 }, sel: { r1: 0, r2: 0, c1: 0, c2: 0 }, editing: false, rowCount: 0, colCount: 0 });

describe('설치 — 기본 묶음·정책·충돌', () => {
    it('기본 묶음은 넘버스 새 표(행열·폭·합치기·머리 고정·채우기·합계 바·스타일)를 켜고 붙여넣기 넘침은 append', () => {
        const cfg = buildConfig(DEFAULT_FEATURES, lookupFeature, S);
        expect([...cfg.caps].sort()).toEqual(['axis-edit', 'col-resize', 'fill', 'history', 'merge', 'quick-calc', 'rows', 'sticky-headers', 'table-style']);
        expect(cfg.pasteOverflow).toBe('append');
    });

    it('정책 모듈이 없으면 넘침은 clip(기본값)', () => {
        const cfg = buildConfig(['rows'], lookupFeature, S);
        expect(cfg.pasteOverflow).toBe('clip');
    });

    it('🔴 붙여넣기 정책 둘을 같이 주면 던진다', () => {
        expect(() => buildConfig(['paste-policy:append', 'paste-policy:clip'], lookupFeature, S)).toThrow(/같이 쓸 수 없다/);
    });

    it('🔴 두 기능이 같은 키를 잡으면 던진다(키맵 충돌)', () => {
        const a: TableFeature = { id: 'ka', version: '0.1.0', install: (ctx) => { ctx.keymap.add('Mod+Shift+K', () => {}); } };
        const b: TableFeature = { id: 'kb', version: '0.1.0', install: (ctx) => { ctx.keymap.add('Mod+Shift+K', () => {}); } };
        const reg: Record<string, TableFeature> = { ka: a, kb: b };
        expect(() => buildConfig([a, b], (id) => reg[id], S)).toThrow(/키맵 충돌/);
    });
});

describe('레지스트리 — 등록·조회', () => {
    it('등록하면 lookup 으로 찾히고, dispose 하면 사라진다', () => {
        const f: TableFeature = { id: 'x-demo', version: '0.1.0', install: () => {} };
        expect(lookupFeature('x-demo')).toBeUndefined();
        const d = registerFeature(f);
        expect(lookupFeature('x-demo')).toBe(f);
        d.dispose();
        expect(lookupFeature('x-demo')).toBeUndefined();
    });

    it('내장 id 는 덮을 수 없다', () => {
        expect(() => registerFeature({ id: 'rows', version: '9.9.9', install: () => {} })).toThrow(/덮을 수 없다/);
    });
});
