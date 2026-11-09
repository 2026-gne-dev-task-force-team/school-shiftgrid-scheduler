/**
 * 노드 얼굴 자료 꼴 정규화 · 관계 칸 모델(P1 은 순수 함수뿐) · 「label 을 키로 쓰는 코드 0」 소스 검사.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { blankDb, normalizeDb, normalizeRelation, normalizeRow, relationToText } from './schema';
import { planConvert } from './convert';

describe('blankDb — 새 레코드 뷰', () => {
    it('제목(글자) 한 칸 · 보기 하나 · 칸 key 는 f_ 로 시작', () => {
        const d = blankDb();
        expect(d.fields).toHaveLength(1);
        expect(d.fields[0].type).toBe('text');
        expect(d.fields[0].key.startsWith('f_')).toBe(true);
        expect(d.titleKey).toBe(d.fields[0].key);
        expect(d.views).toHaveLength(1);
        expect(d.views[0].columns).toEqual([{ key: d.titleKey }]);
    });
    it('정규화를 통과해도 그대로다(멱등)', () => {
        const d = blankDb();
        expect(normalizeDb(JSON.parse(JSON.stringify(d)))).toEqual(d);
    });
});

describe('normalizeDb — 깨진 저장값을 성하게', () => {
    it('빈 값·엉뚱한 값도 제목 칸 + 보기 하나가 생긴다', () => {
        for (const bad of [undefined, null, 5, 'x', {}, { fields: 3 }]) {
            const d = normalizeDb(bad);
            expect(d.fields.length).toBeGreaterThanOrEqual(1);
            expect(d.fields.some((f) => f.key === d.titleKey && f.type === 'text')).toBe(true);
            expect(d.views.length).toBeGreaterThanOrEqual(1);
        }
    });
    it('제목 칸은 타입이 text 로 고정된다(옛 값이 숫자여도)', () => {
        const d = normalizeDb({ fields: [{ key: 'f_t', label: '제목', type: 'number', options: [{ value: 'a', label: 'a' }] }], titleKey: 'f_t' });
        expect(d.fields[0].type).toBe('text');
        expect(d.fields[0].options).toBeUndefined();
    });
    it('칸 key 가 겹치거나 비면 버리고 · titleKey 가 없는 칸을 가리키면 첫 글자 칸이 제목이 된다', () => {
        const d = normalizeDb({
            fields: [{ key: 'f_a', label: '가', type: 'number' }, { key: 'f_a', label: '중복', type: 'text' }, { key: '', label: '빈' }, { key: 'f_b', label: '나', type: 'text' }],
            titleKey: 'ghost',
        });
        expect(d.fields.map((f) => f.key)).toEqual(['f_a', 'f_b']);
        expect(d.titleKey).toBe('f_b');
    });
    it('보기의 칸 목록이 칸과 맞춰진다(새 칸은 뒤에)', () => {
        const d = normalizeDb({
            fields: [{ key: 'f_t', label: '제목', type: 'text' }, { key: 'f_n', label: '수', type: 'number' }],
            titleKey: 'f_t',
            views: [{ id: 'v', name: '표', kind: 'table', columns: [{ key: 'f_t' }] }],
        });
        expect(d.views[0].columns.map((c) => c.key)).toEqual(['f_t', 'f_n']);
    });
});

describe('normalizeRow', () => {
    it('값 사전 · 생성/수정 시각', () => {
        const r = normalizeRow({ values: { f_a: '글', f_b: 3, f_c: true, f_d: ['x'], f_e: null, f_f: { bad: 1 } } });
        expect(r.values).toEqual({ f_a: '글', f_b: 3, f_c: true, f_d: ['x'], f_e: null });
        expect(r.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
        expect(r.v).toBe(1);
    });
    it('엉뚱한 값은 빈 행', () => {
        expect(normalizeRow(null).values).toEqual({});
    });
});

describe('관계 칸 모델 — UI 는 P3, 값·정규화·글자만', () => {
    it('값 [n1, n2] 가 JSON 왕복 후에도 같다', () => {
        const v = normalizeRelation(['n1', 'n2']);
        expect(normalizeRelation(JSON.parse(JSON.stringify(v)))).toEqual(['n1', 'n2']);
    });
    it('겹침·빈 값을 버리고, many=false 면 하나만', () => {
        expect(normalizeRelation(['a', 'a', '', 3, 'b'])).toEqual(['a', 'b']);
        expect(normalizeRelation(['a', 'b'], false)).toEqual(['a']);
        expect(normalizeRelation('x')).toEqual(['x']);
        expect(normalizeRelation(null)).toEqual([]);
    });
    it('toText — 대상 이름을 `, ` 로 잇는다 · 모르는 id 는 건너뛴다(값은 안 지운다)', () => {
        const names: Record<string, string> = { n1: '첫째', n2: '둘째' };
        expect(relationToText(['n1', 'n2'], (id) => names[id])).toBe('첫째, 둘째');
        expect(relationToText(['n1', 'gone', 'n2'], (id) => names[id])).toBe('첫째, 둘째');
        expect(relationToText([], (id) => names[id])).toBe('');
    });
    it('relation 은 P1 레지스트리에 없다 — 변환 대상으로도 안 뜬다', () => {
        const p = planConvert([{ id: 'r', value: 'x' }], { key: 'f_x', label: 'x', type: 'text' }, 'relation');
        expect(p.changes).toEqual([]);
    });
});

describe('🔴 label 을 키로 쓰는 코드 0건 (소스 검사)', () => {
    function walk(dir: string): string[] {
        return readdirSync(dir).flatMap((n) => {
            const p = join(dir, n);
            return statSync(p).isDirectory() ? walk(p) : [p];
        });
    }
    const root = join(__dirname);
    const files = walk(root).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
    it('스캔할 파일이 있다', () => { expect(files.length).toBeGreaterThan(5); });
    it('values[…label…] · row[f.label] · [field.label] 같은 읽기가 없다', () => {
        const bad = /\[\s*[\w.]*\.label\s*\]/;
        const hits = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((ln, i) => (bad.test(ln) ? `${f}:${i + 1}` : '')).filter(Boolean));
        expect(hits, `label 을 키로 읽는 줄: ${hits.join(', ')}`).toEqual([]);
    });
    it('Cell.tsx 에 field.type === 비교가 없다(화면이 switch(type) 을 안 한다)', () => {
        const src = readFileSync(join(root, 'Cell.tsx'), 'utf8');
        expect(/\.type\s*===/.test(src)).toBe(false);
        expect(/switch\s*\(\s*\w+\.type/.test(src)).toBe(false);
    });
    it('도메인 낱말(사람·방·일정·학교) 0건', () => {
        const words = /사람|명단|일정|학교|교사|교실/;
        const hits = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').map((ln, i) => (words.test(ln) && !f.includes('PlaygroundView') ? `${f.slice(root.length + 1)}:${i + 1}:${ln.trim().slice(0, 40)}` : '')).filter(Boolean));
        expect(hits).toEqual([]);
    });
});
