/**
 * 붙여넣기 — 엑셀 TSV 파싱 · 행·칸 계획(칸이 모자라면 글자 칸을 만든다 · 모르는 선택지는 만든다).
 */
import { describe, it, expect } from 'vitest';
import { buildPaste, headerKeys } from './paste';
import type { RecordField } from './contracts/collection';

describe('headerKeys — 첫 줄이 머리글인가', () => {
    const F: RecordField[] = [{ key: 'f_t', label: '이름', type: 'text' }, { key: 'f_k', label: '구분', type: 'select' }];
    it('제목 칸 이름표가 있으면 머리글 — 앞뒤 공백 무시 · 모르는 열은 null', () => {
        expect(headerKeys(F, 'f_t', [' 구분 ', '이름', '연락처'])).toEqual(['f_k', 'f_t', null]);
    });
    it('제목 칸 이름표가 없으면 머리글이 아니다(데이터 줄)', () => {
        expect(headerKeys(F, 'f_t', ['가나다', '구분'])).toBeNull();
    });
});

describe('buildPaste', () => {
    const fields: RecordField[] = [
        { key: 'f_t', label: '제목', type: 'text' },
        { key: 'f_n', label: '수', type: 'number' },
        { key: 'f_s', label: '상태', type: 'select', options: [{ value: '진행', label: '진행' }] },
    ];
    it('3줄 → 행 3 · 첫 칸이 제목 칸으로 간다', () => {
        const p = buildPaste(fields, ['f_t', 'f_n', 'f_s'], [['가', '1', '진행'], ['나', '2', '완료'], ['다', '', '']]);
        expect(p.rows).toHaveLength(3);
        expect(p.rows[0]).toEqual({ f_t: '가', f_n: 1, f_s: '진행' });
        expect(p.rows[2]).toEqual({ f_t: '다' });   // 빈 칸은 값을 안 넣는다
        expect(p.addedFields).toBe(0);
    });
    it('모르는 선택지(완료)는 선택지로 만든다', () => {
        const p = buildPaste(fields, ['f_t', 'f_n', 'f_s'], [['나', '2', '완료']]);
        expect(p.fieldsChanged).toBe(true);
        expect(p.fields[2].options?.map((o) => o.value)).toEqual(['진행', '완료']);
        expect(fields[2].options).toHaveLength(1);   // 원본은 그대로(순수)
    });
    it('칸이 모자라면 글자 칸을 만든다(f_ key · 「칸 N」)', () => {
        const p = buildPaste(fields, ['f_t', null, null], [['가', 'x', 'y']]);
        expect(p.addedFields).toBe(2);
        expect(p.fields).toHaveLength(5);
        const made = p.fields.slice(3);
        expect(made.every((f) => f.type === 'text' && f.key.startsWith('f_'))).toBe(true);
        expect(p.rows[0][made[0].key]).toBe('x');
        expect(p.rows[0][made[1].key]).toBe('y');
    });
    it('모든 칸이 빈 행은 건너뛴다', () => {
        const p = buildPaste(fields, ['f_t'], [['가'], [''], ['다']]);
        expect(p.rows).toHaveLength(2);
    });
});
