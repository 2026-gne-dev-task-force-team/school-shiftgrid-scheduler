/**
 * P2 새 칸 타입의 순수 로직 — 숫자 서식 · 날짜 정규화(옛 string→{start}) · url/email/phone 검증 · status 기본 세 그룹.
 */
import { describe, it, expect } from 'vitest';
import { formatNumber } from './format';
import { toDateValue, dateText, parseDateText } from './dates';
import { isValidLink, hrefOf } from './links';
import { BUILTIN_FIELD_TYPES, STATUS_GROUPS } from './builtin';

describe('숫자 서식 — 저장값 불변, 표시만', () => {
    it('comma 천 단위 · percent ×100+% · won 원', () => {
        expect(formatNumber(1234567, { format: 'comma' })).toBe('1,234,567');
        expect(formatNumber(0.5, { format: 'percent' })).toBe('50%');
        expect(formatNumber(1234, { format: 'won' })).toBe('1,234원');
        expect(formatNumber(1234567, { format: 'plain' })).toBe('1234567');
    });
    it('decimals · 음수 · 빈 값', () => {
        expect(formatNumber(1234.5, { format: 'comma', decimals: 2 })).toBe('1,234.50');
        expect(formatNumber(-1234, { format: 'comma' })).toBe('-1,234');
        expect(formatNumber(null)).toBe('');
        expect(formatNumber(Number.NaN)).toBe('');
    });
    it('number 타입 toText 는 날값 그대로(정렬·검색·복사용)', () => {
        const num = BUILTIN_FIELD_TYPES.find((d) => d.type === 'number')!;
        expect(num.toText(1234567, { format: 'comma' }, { key: 'f', label: '', type: 'number' })).toBe('1234567');
    });
});

describe('날짜 — string → {start, end?} 로 오른다', () => {
    it('옛 string 이 {start} 로 읽힘', () => {
        expect(toDateValue('2026-11-08')).toEqual({ start: '2026-11-08' });
        expect(toDateValue('2026-11-08T14:00')).toEqual({ start: '2026-11-08T14:00' });
    });
    it('{start,end} 는 그대로 · 깨진 값은 null', () => {
        expect(toDateValue({ start: '2026-11-08', end: '2026-11-10' })).toEqual({ start: '2026-11-08', end: '2026-11-10' });
        expect(toDateValue({ start: '엉뚱' })).toBeNull();
        expect(toDateValue('내일')).toBeNull();
        expect(toDateValue(null)).toBeNull();
    });
    it('dateText — range 면 start ~ end · 시각은 T 를 공백으로', () => {
        expect(dateText({ start: '2026-11-08' })).toBe('2026-11-08');
        expect(dateText({ start: '2026-11-08', end: '2026-11-10' })).toBe('2026-11-08 ~ 2026-11-10');
        expect(dateText('2026-11-08T14:00')).toBe('2026-11-08 14:00');
    });
    it('parseDateText — 붙여넣기 글자를 값으로', () => {
        expect(parseDateText('2026-11-08')).toEqual({ start: '2026-11-08' });
        expect(parseDateText('2026-11-08 ~ 2026-11-10')).toEqual({ start: '2026-11-08', end: '2026-11-10' });
        expect(parseDateText('빈')).toBeNull();
    });
    it('date 타입 defaultConfig 에 time·range 가 있다', () => {
        const date = BUILTIN_FIELD_TYPES.find((d) => d.type === 'date')!;
        expect(date.defaultConfig).toEqual({ time: false, range: false });
    });
});

describe('url·email·phone — 검증 + href', () => {
    it('형식 판정', () => {
        expect(isValidLink('url', 'example.com')).toBe(true);
        expect(isValidLink('url', 'https://a.b/c')).toBe(true);
        expect(isValidLink('url', 'notaurl')).toBe(false);
        expect(isValidLink('email', 'a@b.co')).toBe(true);
        expect(isValidLink('email', 'nope')).toBe(false);
        expect(isValidLink('phone', '055-123-4567')).toBe(true);
        expect(isValidLink('phone', 'abc')).toBe(false);
    });
    it('href — scheme 보강 · mailto · tel(공백 제거)', () => {
        expect(hrefOf('url', 'example.com')).toBe('https://example.com');
        expect(hrefOf('url', 'http://x.y')).toBe('http://x.y');
        expect(hrefOf('email', 'a@b.co')).toBe('mailto:a@b.co');
        expect(hrefOf('phone', '055-123-4567')).toBe('tel:0551234567');
    });
});

describe('status — 기본 선택지 셋이 세 그룹', () => {
    it('defaultOptions 3개 · groups todo/doing/done 가 각각 가리킨다', () => {
        const status = BUILTIN_FIELD_TYPES.find((d) => d.type === 'status')!;
        expect(status.defaultOptions).toHaveLength(3);
        const vals = status.defaultOptions!.map((o) => o.value);
        expect(STATUS_GROUPS.todo.concat(STATUS_GROUPS.doing, STATUS_GROUPS.done).sort()).toEqual(vals.slice().sort());
        expect((status.defaultConfig as { groups: unknown }).groups).toEqual(STATUS_GROUPS);
    });
});

describe('created·updated·id — 자동 계산(읽기 전용)', () => {
    it('readOnly 이고 id 는 prefix+번호', () => {
        const id = BUILTIN_FIELD_TYPES.find((d) => d.type === 'id')!;
        expect(id.readOnly).toBe(true);
        expect(id.toText(7, { prefix: 'A-' }, { key: 'f', label: '', type: 'id' })).toBe('A-7');
        const created = BUILTIN_FIELD_TYPES.find((d) => d.type === 'created')!;
        expect(created.readOnly).toBe(true);
        expect(created.toText('2026-11-09T10:00', undefined, { key: 'f', label: '', type: 'created' })).toBe('2026-11-09 10:00');
    });
});
