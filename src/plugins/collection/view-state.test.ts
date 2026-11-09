/**
 * 보기 정의 정규화 검사 — 아무 JSON(옛 판·깨진 값)을 안전한 ViewDef 로 떨구는지 · 옛 RecordViewState 를 올리는지 · 칸과 맞추는지.
 */
import { describe, it, expect } from 'vitest';
import { defaultView, normalizeView, normalizeViews, reconcileColumns } from './view-state';
import type { RecordField } from './contracts/collection';

describe('normalizeView', () => {
    it('객체가 아니면 기본 보기(표 · 빈 필터)', () => {
        for (const bad of [null, 42, 'x']) {
            const v = normalizeView(bad);
            expect(v.kind).toBe('table');
            expect(v.filter).toEqual({ and: [] });
            expect(v.sorts).toEqual([]);
            expect(v.columns).toEqual([]);
        }
    });

    it('새 꼴은 그대로 받는다', () => {
        const v = normalizeView({
            id: 'v1', name: '내 보기', kind: 'table',
            filter: { or: [{ key: 'a', op: 'eq', value: '1' }] },
            sorts: [{ key: 'a', dir: 'desc' }],
            columns: [{ key: 'b', width: 200 }, { key: 'a', hidden: true }],
        });
        expect(v.id).toBe('v1');
        expect(v.name).toBe('내 보기');
        expect(v.filter).toEqual({ or: [{ key: 'a', op: 'eq', value: '1' }] });
        expect(v.sorts).toEqual([{ key: 'a', dir: 'desc' }]);
        expect(v.columns).toEqual([{ key: 'b', width: 200 }, { key: 'a', hidden: true }]);
    });

    it('🔴 옛 RecordViewState 꼴(filters·hidden·widths) → ViewDef 하나로 올라간다', () => {
        const v = normalizeView({
            kind: 'table', search: '김',
            filters: [{ key: 'a', op: 'eq', value: '1' }, { key: 'b', op: 'empty' }],
            sorts: [{ key: 'a', dir: 'desc' }], hidden: ['b'], widths: { a: 200, c: 90 },
        });
        expect(v.filter).toEqual({ and: [{ key: 'a', op: 'eq', value: '1' }, { key: 'b', op: 'empty' }] });
        expect(v.sorts).toEqual([{ key: 'a', dir: 'desc' }]);
        const byKey = Object.fromEntries(v.columns.map((c) => [c.key, c]));
        expect(byKey.b).toEqual({ key: 'b', hidden: true });
        expect(byKey.a).toEqual({ key: 'a', width: 200 });
        expect(byKey.c).toEqual({ key: 'c', width: 90 });
        expect('search' in v).toBe(false);   // 검색어는 잠시 상태 — 보기 정의에 안 들어간다
    });

    it('깨진 필터·정렬 줄은 버린다', () => {
        const v = normalizeView({
            filters: [{ key: 'a' }, { op: 'eq' }, { key: 'b', op: 'contains', value: 'x' }, null],
            sorts: [{ key: 'a', dir: 'sideways' }, { key: 'b', dir: 'asc' }],
        });
        expect(v.filter).toEqual({ and: [{ key: 'b', op: 'contains', value: 'x' }] });
        expect(v.sorts).toEqual([{ key: 'b', dir: 'asc' }]);
    });

    it('이상한 폭은 거르고 중복 칸은 앞엣것만', () => {
        const v = normalizeView({ columns: [{ key: 'a', width: -5 }, { key: 'a', width: 100 }, { key: 'b', width: 'wide' }, { key: '' }, 3] });
        expect(v.columns).toEqual([{ key: 'a' }, { key: 'b' }]);
    });
});

describe('normalizeViews', () => {
    it('빈 값은 보기 하나(최소 1)', () => {
        expect(normalizeViews(undefined)).toHaveLength(1);
        expect(normalizeViews([])).toHaveLength(1);
    });
    it('id 가 겹치면 뒤엣것을 버린다 · 배열·{views}·옛 단일 객체를 다 받는다', () => {
        expect(normalizeViews([{ id: 'x' }, { id: 'x' }, { id: 'y' }]).map((v) => v.id)).toEqual(['x', 'y']);
        expect(normalizeViews({ views: [{ id: 'q' }] }).map((v) => v.id)).toEqual(['q']);
        expect(normalizeViews({ filters: [], hidden: ['z'] })).toHaveLength(1);
    });
});

describe('reconcileColumns — 보기가 칸과 맞는다', () => {
    const f = (key: string): RecordField => ({ key, label: key, type: 'text' });
    it('모르는 칸을 뒤에 붙이고, 없어진 칸을 뺀다(순서·폭은 지킨다)', () => {
        const v = { ...defaultView(), columns: [{ key: 'b', width: 120 }, { key: 'gone' }, { key: 'a' }] };
        const r = reconcileColumns(v, [f('a'), f('b'), f('c')]);
        expect(r.columns).toEqual([{ key: 'b', width: 120 }, { key: 'a' }, { key: 'c' }]);
    });
    it('이미 맞으면 같은 객체(리렌더 폭주 방지)', () => {
        const v = { ...defaultView(), columns: [{ key: 'a' }, { key: 'b' }] };
        expect(reconcileColumns(v, [f('a'), f('b')])).toBe(v);
    });
});
