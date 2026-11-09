/**
 * 타입 변환 전수 — 🔴 이 앱의 유일한 비가역 조작이라 변환 표를 한 줄씩 못 박는다.
 *   깎임(lost)은 「옛 글자가 있는데 새 값의 글자가 다르다」 — 확인창이 이 수를 보여 준다.
 */
import { describe, it, expect } from 'vitest';
import { planConvert } from './convert';
import type { RecordCellValue, RecordField } from './contracts/collection';

const field = (type: string, extra: Partial<RecordField> = {}): RecordField => ({ key: 'f_x', label: '칸', type, ...extra });
const rows = (...vals: (RecordCellValue | undefined)[]) => vals.map((value, i) => ({ id: `r${i}`, value }));
const valuesOf = (p: ReturnType<typeof planConvert>, n: number) => Array.from({ length: n }, (_, i) => p.changes.find((c) => c.id === `r${i}`)?.value);

describe('text →', () => {
    it('number — 숫자는 그대로 · 실패는 빈 값(깎임)', () => {
        const p = planConvert(rows('12', '12a', '12a', '  ', '3.5', '12a'), field('text'), 'number');
        expect(valuesOf(p, 6)).toEqual([12, null, null, undefined, 3.5, null]);   // 공백 행은 바뀔 게 없다
        expect(p.lost).toBe(3);   // '12a' 세 행(= 명세의 「3행의 값이 비워집니다」)
        expect(p.field.type).toBe('number');
    });
    it('select — 같은 글자의 선택지가 없으면 만든다(깎임 없음) · 값 유지', () => {
        const p = planConvert(rows('파랑', '빨강', '파랑', ''), field('text'), 'select');
        expect(p.lost).toBe(0);
        expect(p.field.options?.map((o) => o.label)).toEqual(['파랑', '빨강']);
        expect(p.field.options?.every((o) => o.value === o.label)).toBe(true);
        expect(p.changes).toEqual([]);   // 값은 이미 글자 그대로라 바꿀 것이 없다 — 선택지만 생긴다
    });
    it('multi — 쉼표로 쪼개 선택지를 만든다', () => {
        const p = planConvert(rows('a, b', 'b'), field('text'), 'multi');
        expect(p.lost).toBe(0);
        expect(p.field.options?.map((o) => o.value)).toEqual(['a', 'b']);
        expect(valuesOf(p, 2)).toEqual([['a', 'b'], ['b']]);
    });
    it('check — 비어 있지 않으면 켜짐(깎임: 내용이 사라진다)', () => {
        const p = planConvert(rows('예', '', 'x'), field('text'), 'check');
        expect(valuesOf(p, 3)).toEqual([true, undefined, true]);   // 빈 칸은 그대로 둔다
        expect(p.lost).toBe(2);
    });
    it('date — 날짜 꼴만 {start} 로 올리고 나머지는 빈 값(깎임)', () => {
        const p = planConvert(rows('2026-11-08', '내일'), field('text'), 'date');
        expect(valuesOf(p, 2)).toEqual([{ start: '2026-11-08' }, null]);   // 글자가 {start} 객체로 오른다
        expect(p.lost).toBe(1);
    });
});

describe('number →', () => {
    it('text — 글자로(깎임 없음)', () => {
        const p = planConvert(rows(12, 0, null), field('number'), 'text');
        expect(valuesOf(p, 3)).toEqual(['12', '0', undefined]);
        expect(p.lost).toBe(0);
    });
    it('check — 켜짐으로(깎임)', () => {
        const p = planConvert(rows(5, null), field('number'), 'check');
        expect(p.lost).toBe(1);
    });
});

describe('select ↔ multi', () => {
    const opts = [{ value: 'a', label: '가' }, { value: 'b', label: '나' }];
    it('select → multi — 배열로 · 선택지 유지 · 깎임 없음', () => {
        const p = planConvert(rows('a', null, 'b'), field('select', { options: opts }), 'multi');
        expect(p.lost).toBe(0);
        expect(p.field.options).toEqual(opts);
        expect(valuesOf(p, 3)).toEqual([['a'], undefined, ['b']]);   // 빈 행은 그대로
    });
    it('multi → select — 첫 번째만(여러 개 고른 행만 깎임)', () => {
        const p = planConvert(rows(['a', 'b'], ['b'], []), field('multi', { options: opts }), 'select');
        expect(valuesOf(p, 3)).toEqual(['a', 'b', undefined]);   // 첫 행은 첫 값만 남고 나머지는 사라진다
        expect(p.lost).toBe(1);
    });
    it('select → text — 라벨 글자로', () => {
        const p = planConvert(rows('a'), field('select', { options: opts }), 'text');
        expect(p.field.options).toBeUndefined();
        expect(valuesOf(p, 1)).toEqual(['가']);
        expect(p.lost).toBe(0);
    });
});

describe('check → 그 밖', () => {
    it('text — ✓ 글자 · 꺼짐은 빈 값(깎임 없음)', () => {
        const p = planConvert(rows(true, false), field('check'), 'text');
        expect(valuesOf(p, 2)).toEqual(['✓', undefined]);   // 꺼짐은 빈 글자 — 그대로 둔다
        expect(p.lost).toBe(0);
    });
});

describe('날짜 → 글자 · 같은 타입 · 모르는 타입', () => {
    it('date → text 는 그대로 글자(깎임 없음)', () => {
        const p = planConvert(rows('2026-11-08'), field('date'), 'text');
        expect(p.changes).toEqual([]);   // 값이 이미 같은 글자다
        expect(p.lost).toBe(0);
    });
    it('같은 타입·모르는 타입은 아무것도 안 한다', () => {
        expect(planConvert(rows('x'), field('text'), 'text')).toMatchObject({ changes: [], lost: 0 });
        expect(planConvert(rows('x'), field('text'), 'ghost.none')).toMatchObject({ changes: [], lost: 0 });
    });
});

describe('변환 계산은 입력을 안 바꾼다(순수)', () => {
    it('칸 정의 원본이 그대로', () => {
        const f = field('select', { options: [{ value: 'a', label: '가' }] });
        const snap = JSON.stringify(f);
        planConvert(rows('a'), f, 'multi');
        expect(JSON.stringify(f)).toBe(snap);
    });
});
