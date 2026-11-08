/**
 * 내장 칸 타입 여섯 — 글자·숫자·고르기·여러 개·날짜·체크. 꽂힌 타입과 같은 FieldTypeDef 꼴이다(레지스트리가 같은 길로 올린다).
 *   🔴 「값을 글자로(toText)·글자에서 값으로(fromText)」가 정렬·검색·복사·붙여넣기·타입 변환의 공통 어휘다.
 */
import type { FieldTypeDef, FilterOpDef, RecordCellValue, RecordField } from '../contracts/record-view';
import { CheckCell, DateCell, MultiCell, NumberCell, SelectCell, TextCell } from './cells';
import { toNum, universalOps } from './ops';

const labelOf = (field: RecordField, value: string): string => field.options?.find((o) => o.value === value)?.label ?? value;
/** 글자 → 선택지 값 — 라벨이 같은 선택지가 있으면 그 값, 없으면 글자 그대로(선택지는 변환·붙여넣기가 만든다) */
const valueOfLabel = (field: RecordField, text: string): string => field.options?.find((o) => o.label === text || o.value === text)?.value ?? text;

/** 정의를 만들 때 공통 연산자(포함·비어 있음…)를 그 정의의 toText 에 닫아 붙인다 */
function withOps(def: Omit<FieldTypeDef, 'ops'>, extra: (u: ReturnType<typeof universalOps>) => FilterOpDef[]): FieldTypeDef {
    const full = def as FieldTypeDef;
    full.ops = extra(universalOps(full));
    return full;
}
const op = (id: string, label: string, match: FilterOpDef['match'], needsValue = true): FilterOpDef => ({ id, label, needsValue, match });
const text = (v: RecordCellValue | undefined): string => (v === null || v === undefined ? '' : String(v));

const textType = withOps({
    type: 'text', label: '글자', icon: 'text', filterInput: 'text', Cell: TextCell,
    toText: (v) => text(v),
    fromText: (t) => t,
}, (u) => [
    u.contains, u.notContains,
    op('eq', '같음', (v, a) => text(v) === String(a ?? '')),
    op('ne', '다름', (v, a) => text(v) !== String(a ?? '')),
    u.empty, u.notEmpty,
]);

const numberType = withOps({
    type: 'number', label: '숫자', icon: 'hash', filterInput: 'number', Cell: NumberCell,
    toText: (v) => (typeof v === 'number' ? (Number.isNaN(v) ? '' : String(v)) : text(v)),
    fromText: (t) => { const s = t.trim(); if (s === '') return null; const n = Number(s.replace(/,/g, '')); return Number.isNaN(n) ? null : n; },
    compare: (a, b) => toNum(a) - toNum(b),
}, (u) => {
    const cmp = (f: (x: number, y: number) => boolean): FilterOpDef['match'] => (v, a) => {
        const x = toNum(v);
        return !Number.isNaN(x) && f(x, toNum(a));
    };
    return [
        op('eq', '같음', (v, a) => !Number.isNaN(toNum(v)) && toNum(v) === toNum(a)),
        op('ne', '다름', (v, a) => toNum(v) !== toNum(a)),
        op('gt', '초과', cmp((x, y) => x > y)), op('gte', '이상', cmp((x, y) => x >= y)),
        op('lt', '미만', cmp((x, y) => x < y)), op('lte', '이하', cmp((x, y) => x <= y)),
        u.empty, u.notEmpty,
    ];
});

const selectType = withOps({
    type: 'select', label: '고르기', icon: 'chevronDown', hasOptions: true, filterInput: 'option', Cell: SelectCell,
    toText: (v, _c, f) => (v === null || v === undefined || v === '' ? '' : labelOf(f, String(v))),
    fromText: (t, _c, f) => (t.trim() === '' ? null : valueOfLabel(f, t.trim())),
    groupKey: (v) => (v === null || v === undefined || v === '' ? null : String(v)),
}, (u) => [
    op('eq', '같음', (v, a) => !(v === null || v === undefined || v === '') && String(v) === String(a ?? '')),
    op('ne', '다름', (v, a) => String(v ?? '') !== String(a ?? '')),
    u.empty, u.notEmpty,
]);

const multiType = withOps({
    type: 'multi', label: '여러 개', icon: 'layers', hasOptions: true, filterInput: 'option', Cell: MultiCell,
    toText: (v, _c, f) => (Array.isArray(v) ? v.map((x) => labelOf(f, String(x))).join(', ') : ''),
    fromText: (t, _c, f) => t.split(',').map((s) => s.trim()).filter((s) => s !== '').map((s) => valueOfLabel(f, s)),
    isEmpty: (v) => !Array.isArray(v) || v.length === 0,
    groupKey: (v) => (Array.isArray(v) && v.length > 0 ? String(v[0]) : null),
}, (u) => [
    op('has', '포함', (v, a) => Array.isArray(v) && v.map(String).includes(String(a ?? ''))),
    op('notHas', '미포함', (v, a) => !(Array.isArray(v) && v.map(String).includes(String(a ?? '')))),
    u.empty, u.notEmpty,
]);

const dateType = withOps({
    type: 'date', label: '날짜', icon: 'calendar', filterInput: 'date', Cell: DateCell,
    toText: (v) => text(v),
    fromText: (t) => { const s = t.trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; },
}, (u) => [
    op('eq', '같음', (v, a) => text(v) !== '' && text(v) === String(a ?? '')),
    op('before', '이전', (v, a) => text(v) !== '' && text(v) < String(a ?? '')),
    op('after', '이후', (v, a) => text(v) !== '' && text(v) > String(a ?? '')),
    u.empty, u.notEmpty,
]);

const checkType = withOps({
    type: 'check', label: '체크', icon: 'check', Cell: CheckCell,
    toText: (v) => (v ? '✓' : ''),
    fromText: (t) => t.trim() !== '',
    isEmpty: (v) => v === null || v === undefined,   // false 도 값이다(꺼짐)
    compare: (a, b) => (a ? 1 : 0) - (b ? 1 : 0),
    groupKey: (v) => (v ? 'true' : 'false'),
}, () => [
    op('isTrue', '켜짐', (v) => !!v, false),
    op('isFalse', '꺼짐', (v) => !v, false),
]);

/** 내장 여섯 — 순서가 칸 추가 팝오버의 순서다. 🔴 relation 은 일부러 없다(P3 에 등록). */
export const BUILTIN_FIELD_TYPES: readonly FieldTypeDef[] = [textType, numberType, selectType, multiType, dateType, checkType];
