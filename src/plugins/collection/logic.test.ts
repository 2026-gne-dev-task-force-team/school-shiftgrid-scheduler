/**
 * 레코드 뷰 순수 로직 검사 — 타입별 비교·빈 값 순서·multi 포함·필터 연산자·검색·파이프라인.
 *   🔴 화면이 보여 주는 행 순서는 전부 여기서 난다 — 「됐다」를 여기서 못 박는다.
 */
import { describe, it, expect } from 'vitest';
import {
    applySorts, compareByField, deriveRows, displayText, evalFilter, filterIsEmpty, flatRules, isEmptyValue,
    matchesRule, matchesSearch, normalizeFilter, opNeedsValue, opsFor, pruneFilter, toNumber, withFlatRules,
} from './logic';
import type { FilterNode, FilterRule, RecordField, SortRule } from './contracts/collection';

const F: Record<string, RecordField> = {
    name: { key: 'name', label: '이름', type: 'text' },
    age: { key: 'age', label: '나이', type: 'number' },
    team: { key: 'team', label: '팀', type: 'select', options: [{ value: 'a', label: '가' }, { value: 'b', label: '나' }] },
    tags: { key: 'tags', label: '꼬리표', type: 'multi', options: [{ value: 'x', label: '엑스' }, { value: 'y', label: '와이' }] },
    born: { key: 'born', label: '생일', type: 'date' },
    done: { key: 'done', label: '끝', type: 'check' },
};

/** deriveRows 입력 — 평평한 규칙 목록을 and 묶음으로 */
function st(p: { search?: string; filters?: FilterRule[]; sorts?: SortRule[] }) {
    return { search: p.search ?? '', filter: { and: p.filters ?? [] }, sorts: p.sorts ?? [] };
}

describe('isEmptyValue — 타입마다 「비었다」가 다르다', () => {
    it('null·undefined·빈 문자열은 비었다', () => {
        expect(isEmptyValue(null, 'text')).toBe(true);
        expect(isEmptyValue(undefined, 'number')).toBe(true);
        expect(isEmptyValue('  ', 'text')).toBe(true);
    });
    it('check 의 false 는 값이다(안 비었다)', () => {
        expect(isEmptyValue(false, 'check')).toBe(false);
        expect(isEmptyValue(true, 'check')).toBe(false);
    });
    it('multi 빈 배열은 비었다 · 원소 있으면 아니다', () => {
        expect(isEmptyValue([], 'multi')).toBe(true);
        expect(isEmptyValue(['x'], 'multi')).toBe(false);
    });
    it('숫자 0 은 값이다 · NaN 은 비었다', () => {
        expect(isEmptyValue(0, 'number')).toBe(false);
        expect(isEmptyValue(Number.NaN, 'number')).toBe(true);
    });
});

describe('toNumber', () => {
    it('문자열·숫자를 숫자로 · 빈 값은 NaN', () => {
        expect(toNumber('12')).toBe(12);
        expect(toNumber(3)).toBe(3);
        expect(Number.isNaN(toNumber(''))).toBe(true);
        expect(Number.isNaN(toNumber(null))).toBe(true);
    });
});

describe('displayText — select/multi 는 라벨로', () => {
    it('select 값은 라벨로 편다', () => {
        expect(displayText({ team: 'a' }, F.team)).toBe('가');
    });
    it('multi 는 라벨을 이어 붙인다', () => {
        expect(displayText({ tags: ['x', 'y'] }, F.tags)).toBe('엑스, 와이');
    });
    it('check 는 ✓/빈칸', () => {
        expect(displayText({ done: true }, F.done)).toBe('✓');
        expect(displayText({ done: false }, F.done)).toBe('');
    });
});

describe('compareByField — 빈 값은 방향과 무관하게 끝으로', () => {
    it('숫자 오름', () => {
        expect(compareByField({ age: 2 }, { age: 5 }, F.age, 'asc')).toBeLessThan(0);
        expect(compareByField({ age: 5 }, { age: 2 }, F.age, 'asc')).toBeGreaterThan(0);
    });
    it('빈 값은 오름이든 내림이든 뒤로 간다', () => {
        expect(compareByField({ age: null }, { age: 1 }, F.age, 'asc')).toBeGreaterThan(0);
        expect(compareByField({ age: null }, { age: 1 }, F.age, 'desc')).toBeGreaterThan(0);
        expect(compareByField({ age: 1 }, { age: null }, F.age, 'desc')).toBeLessThan(0);
    });
    it('check 는 false<true', () => {
        expect(compareByField({ done: false }, { done: true }, F.done, 'asc')).toBeLessThan(0);
    });
    it('날짜(ISO)는 글자 비교로도 시간 순', () => {
        expect(compareByField({ born: '2020-01-01' }, { born: '2021-01-01' }, F.born, 'asc')).toBeLessThan(0);
    });
});

describe('applySorts — 다중·안정', () => {
    const rows = [
        { id: 1, team: 'b', age: 2 },
        { id: 2, team: 'a', age: 5 },
        { id: 3, team: 'a', age: 2 },
        { id: 4, team: 'b', age: 2 },
    ];
    const byKey = new Map(Object.values(F).map((f) => [f.key, f]));
    it('팀 오름 → 나이 오름, 동률은 원래 순서', () => {
        const out = applySorts(rows, byKey, [{ key: 'team', dir: 'asc' }, { key: 'age', dir: 'asc' }]);
        expect(out.map((r) => r.id)).toEqual([3, 2, 1, 4]);
    });
    it('정렬 없으면 그대로(복사본)', () => {
        const out = applySorts(rows, byKey, []);
        expect(out.map((r) => r.id)).toEqual([1, 2, 3, 4]);
        expect(out).not.toBe(rows);
    });
});

describe('opsFor / opNeedsValue', () => {
    it('타입마다 연산자 집합이 다르다', () => {
        expect(opsFor('check')).toEqual(['isTrue', 'isFalse']);
        expect(opsFor('multi')).toContain('has');
        expect(opsFor('number')).toContain('gte');
    });
    it('값이 필요 없는 연산자', () => {
        expect(opNeedsValue('empty')).toBe(false);
        expect(opNeedsValue('isTrue')).toBe(false);
        expect(opNeedsValue('contains')).toBe(true);
        expect(opNeedsValue('empty', 'text')).toBe(false);   // 칸 타입을 알면 그 정의를 본다
        expect(opNeedsValue('gt', 'number')).toBe(true);
    });
});

describe('matchesRule', () => {
    it('text contains / notContains (대소문자 무시)', () => {
        expect(matchesRule({ name: 'Hello' }, F.name, { key: 'name', op: 'contains', value: 'ell' })).toBe(true);
        expect(matchesRule({ name: 'Hello' }, F.name, { key: 'name', op: 'notContains', value: 'zzz' })).toBe(true);
    });
    it('number 비교', () => {
        expect(matchesRule({ age: 10 }, F.age, { key: 'age', op: 'gt', value: 5 })).toBe(true);
        expect(matchesRule({ age: 10 }, F.age, { key: 'age', op: 'lte', value: 10 })).toBe(true);
        expect(matchesRule({ age: 10 }, F.age, { key: 'age', op: 'lt', value: 10 })).toBe(false);
    });
    it('select eq/ne', () => {
        expect(matchesRule({ team: 'a' }, F.team, { key: 'team', op: 'eq', value: 'a' })).toBe(true);
        expect(matchesRule({ team: 'a' }, F.team, { key: 'team', op: 'ne', value: 'b' })).toBe(true);
    });
    it('multi has/notHas', () => {
        expect(matchesRule({ tags: ['x', 'y'] }, F.tags, { key: 'tags', op: 'has', value: 'x' })).toBe(true);
        expect(matchesRule({ tags: ['y'] }, F.tags, { key: 'tags', op: 'notHas', value: 'x' })).toBe(true);
    });
    it('date before/after', () => {
        expect(matchesRule({ born: '2020-05-05' }, F.born, { key: 'born', op: 'before', value: '2021-01-01' })).toBe(true);
        expect(matchesRule({ born: '2020-05-05' }, F.born, { key: 'born', op: 'after', value: '2019-01-01' })).toBe(true);
    });
    it('empty / notEmpty', () => {
        expect(matchesRule({ name: '' }, F.name, { key: 'name', op: 'empty' })).toBe(true);
        expect(matchesRule({ name: 'x' }, F.name, { key: 'name', op: 'notEmpty' })).toBe(true);
    });
    it('check isTrue / isFalse', () => {
        expect(matchesRule({ done: true }, F.done, { key: 'done', op: 'isTrue' })).toBe(true);
        expect(matchesRule({ done: false }, F.done, { key: 'done', op: 'isFalse' })).toBe(true);
    });
    it('빈 값은 gt/eq 등을 통과하지 않는다', () => {
        expect(matchesRule({ age: null }, F.age, { key: 'age', op: 'gt', value: 0 })).toBe(false);
        expect(matchesRule({ age: null }, F.age, { key: 'age', op: 'eq', value: 0 })).toBe(false);
    });
});

describe('matchesSearch — 모든 칸 라벨에서', () => {
    const fields = [F.name, F.team, F.tags];
    it('빈 검색어는 항상 통과', () => {
        expect(matchesSearch({ name: 'x' }, fields, '  ')).toBe(true);
    });
    it('select·multi 라벨로도 찾는다', () => {
        expect(matchesSearch({ team: 'a' }, fields, '가')).toBe(true);
        expect(matchesSearch({ tags: ['y'] }, fields, '와이')).toBe(true);
    });
    it('없는 말은 못 찾는다', () => {
        expect(matchesSearch({ name: 'abc' }, fields, 'zzz')).toBe(false);
    });
});

describe('deriveRows — 필터(AND) → 검색 → 정렬', () => {
    const fields = [F.name, F.age, F.team];
    const recs = [
        { id: 1, name: '가나', age: 30, team: 'a' },
        { id: 2, name: '다라', age: 20, team: 'b' },
        { id: 3, name: '마바', age: 40, team: 'a' },
        { id: 4, name: '사아', age: 25, team: 'b' },
    ];
    it('필터 + 정렬', () => {
        const out = deriveRows(recs, fields, st({ filters: [{ key: 'team', op: 'eq', value: 'a' }], sorts: [{ key: 'age', dir: 'desc' }] }));
        expect(out.map((r) => r.id)).toEqual([3, 1]);
    });
    it('검색은 이름에 걸린다', () => {
        const out = deriveRows(recs, fields, st({ search: '마바' }));
        expect(out.map((r) => (r as { id: number }).id)).toEqual([3]);
    });
    it('검색은 select 라벨에도 걸린다', () => {
        // team 'a' 의 라벨은 '가' — 라벨로 찾아진다(id 1·3)
        const out = deriveRows(recs, fields, st({ search: '가', sorts: [{ key: 'age', dir: 'asc' }] }));
        expect(out.map((r) => (r as { id: number }).id)).toEqual([1, 3]);
    });
    it('칸에 없는 key 의 필터·정렬은 조용히 건너뛴다', () => {
        const out = deriveRows(recs, fields, st({ filters: [{ key: 'ghost', op: 'eq', value: 'z' }], sorts: [{ key: 'ghost', dir: 'asc' }] }));
        expect(out.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    });
    it('원본 배열을 안 바꾼다', () => {
        const before = recs.map((r) => r.id);
        deriveRows(recs, fields, st({ sorts: [{ key: 'age', dir: 'asc' }] }));
        expect(recs.map((r) => r.id)).toEqual(before);
    });
});

describe('FilterNode — 규칙·and·or 2단', () => {
    const byKey = new Map(Object.values(F).map((f) => [f.key, f]));
    const a: FilterRule = { key: 'age', op: 'gt', value: 10 };
    const b: FilterRule = { key: 'team', op: 'eq', value: 'a' };
    const c: FilterRule = { key: 'name', op: 'contains', value: '홍' };

    it('and·or 가 섞인 2단 평가 — { or: [a, { and: [b, c] }] }', () => {
        const node: FilterNode = { or: [a, { and: [b, c] }] };
        expect(evalFilter(node, byKey, { age: 20, team: 'b', name: '이' })).toBe(true);    // a 만 참
        expect(evalFilter(node, byKey, { age: 1, team: 'a', name: '홍길동' })).toBe(true);  // b·c 둘 다 참
        expect(evalFilter(node, byKey, { age: 1, team: 'a', name: '이' })).toBe(false);    // 셋 다 아님
    });
    it('빈 and·or 는 「조건 없음」이라 참', () => {
        expect(evalFilter({ and: [] }, byKey, {})).toBe(true);
        expect(evalFilter({ or: [] }, byKey, {})).toBe(true);
        expect(filterIsEmpty({ and: [{ or: [] }] })).toBe(true);
        expect(filterIsEmpty({ and: [a] })).toBe(false);
    });
    it('칸이 없는 규칙은 통과한다', () => {
        expect(evalFilter({ and: [{ key: 'ghost', op: 'eq', value: 1 }] }, byKey, {})).toBe(true);
    });
    it('정규화 — 3단째 묶음은 버린다(2단까지)', () => {
        const deep = { and: [a, { or: [b, { and: [c] }] }] };
        const n = normalizeFilter(deep) as { and: FilterNode[] };
        expect(n.and).toHaveLength(2);
        const inner = n.and[1] as { or: FilterNode[] };
        expect(inner.or).toEqual([b]);   // 그 안의 { and: [c] } 는 3단이라 사라졌다
    });
    it('정규화 — 깨진 값은 빈 and', () => {
        expect(normalizeFilter(null)).toEqual({ and: [] });
        expect(normalizeFilter({ and: 3 })).toEqual({ and: [] });
    });
    it('툴바용 평평한 목록 — 규칙만 꺼내고, 바꿔 넣어도 or 묶음은 보존', () => {
        const node: FilterNode = { and: [a, { or: [b, c] }] };
        expect(flatRules(node)).toEqual([a]);
        const next = withFlatRules(node, [c]);
        expect(next).toEqual({ and: [c, { or: [b, c] }] });
    });
    it('칸을 지우면 그 칸의 규칙이 묶음 속까지 빠진다', () => {
        const node: FilterNode = { and: [a, { or: [b, c] }] };
        expect(pruneFilter(node, 'team')).toEqual({ and: [a, { or: [c] }] });
        expect(pruneFilter({ and: [{ or: [b] }] }, 'team')).toEqual({ and: [] });
    });
    it('deriveRows 가 or 필터를 먹는다', () => {
        const recs = [{ id: 1, age: 20, team: 'b' }, { id: 2, age: 1, team: 'a' }, { id: 3, age: 1, team: 'b' }];
        const out = deriveRows(recs, [F.age, F.team], { search: '', filter: { or: [a, b] }, sorts: [] });
        expect(out.map((r) => r.id)).toEqual([1, 2]);
    });
});
