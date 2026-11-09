/**
 * 내장 칸 타입 여섯 — 글자·숫자·고르기·여러 개·날짜·체크. 꽂힌 타입과 같은 FieldTypeDef 꼴이다(레지스트리가 같은 길로 올린다).
 *   🔴 「값을 글자로(toText)·글자에서 값으로(fromText)」가 정렬·검색·복사·붙여넣기·타입 변환의 공통 어휘다.
 */
import type { FieldOption, FieldTypeDef, FilterOpDef, RecordCellValue, RecordField } from '../contracts/collection';
import { CheckCell, DateCell, EmailCell, MultiCell, NumberCell, PhoneCell, ReadonlyCell, SelectCell, TextCell, UrlCell } from './cells';
import { RELATIVE_DATES, dateText, inRelative, parseDateText, toDateValue } from './dates';
import { isValidLink, type LinkKind } from './links';
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

/** 날짜 비교·필터는 start(ISO) 로 — ISO 는 글자 순 = 시간 순이라 글자 비교면 된다 */
const dateStart = (v: RecordCellValue | undefined): string => toDateValue(v)?.start ?? '';
const dateType = withOps({
    type: 'date', label: '날짜', icon: 'calendar', filterInput: 'date', Cell: DateCell,
    defaultConfig: { time: false, range: false },
    toText: (v) => dateText(v),
    fromText: (t) => parseDateText(t),
    isEmpty: (v) => toDateValue(v) === null,
    compare: (a, b) => dateStart(a).localeCompare(dateStart(b)),
}, (u) => [
    op('eq', '같음', (v, a) => dateStart(v) !== '' && dateStart(v).slice(0, 10) === String(a ?? '').slice(0, 10)),
    op('before', '이전', (v, a) => dateStart(v) !== '' && dateStart(v) < String(a ?? '')),
    op('after', '이후', (v, a) => dateStart(v) !== '' && dateStart(v) > String(a ?? '')),
    // 상대 날짜 — 값 없이 「오늘 기준」으로 매번 다시 잰다
    ...RELATIVE_DATES.map(([id, label]) => op(id, label, (v) => inRelative(v, id), false)),
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

// ── status — 선택지를 세 그룹(할 일·진행·완료)으로. 그룹은 고정(삭제 UI 없음)이고 선택지만 늘린다. ──
const STATUS_OPTIONS: FieldOption[] = [
    { value: 's_todo', label: '할 일', color: 'gray' },
    { value: 's_doing', label: '진행 중', color: 'blue' },
    { value: 's_done', label: '완료', color: 'green' },
];
/** 그룹 → 그 그룹에 속한 선택지 값들. 그룹 자체는 셋 고정(todo·doing·done). */
export const STATUS_GROUPS: { todo: string[]; doing: string[]; done: string[] } = {
    todo: ['s_todo'], doing: ['s_doing'], done: ['s_done'],
};
const statusType = withOps({
    type: 'status', label: '상태', icon: 'dot', hasOptions: true, filterInput: 'option', Cell: SelectCell,
    defaultConfig: { groups: STATUS_GROUPS },
    defaultOptions: STATUS_OPTIONS,
    toText: (v, _c, f) => (v === null || v === undefined || v === '' ? '' : labelOf(f, String(v))),
    fromText: (t, _c, f) => (t.trim() === '' ? null : valueOfLabel(f, t.trim())),
    groupKey: (v) => (v === null || v === undefined || v === '' ? null : String(v)),
}, (u) => [
    op('eq', '같음', (v, a) => !(v === null || v === undefined || v === '') && String(v) === String(a ?? '')),
    op('ne', '다름', (v, a) => String(v ?? '') !== String(a ?? '')),
    u.empty, u.notEmpty,
]);

// ── url·email·phone — 글자 변종(검증 + 누르면 열기). 저장·정렬·검색은 글자 그대로. ──
function linkType(kind: LinkKind, label: string, icon: FieldTypeDef['icon'], Cell: FieldTypeDef['Cell']): FieldTypeDef {
    return withOps({
        type: kind, label, icon, filterInput: 'text', Cell,
        toText: (v) => text(v),
        fromText: (t) => t.trim(),
    }, (u) => [
        u.contains, u.notContains,
        op('valid', '형식 맞음', (v) => isValidLink(kind, text(v)), false),
        op('invalid', '형식 틀림', (v) => text(v) !== '' && !isValidLink(kind, text(v)), false),
        u.empty, u.notEmpty,
    ]);
}
const urlType = linkType('url', 'URL', 'arrowRight', UrlCell);
const emailType = linkType('email', '이메일', 'fileText', EmailCell);
const phoneType = linkType('phone', '전화', 'user', PhoneCell);

// ── created·updated·id — 자동 계산 칸(읽기 전용 · 값은 행 노드가 채운다). ──
const stamp = (v: RecordCellValue | undefined): string => (typeof v === 'string' ? v : '');
const createdType: FieldTypeDef = {
    type: 'created', label: '생성 일시', icon: 'calendar', readOnly: true, Cell: ReadonlyCell,
    toText: (v) => stamp(v).replace('T', ' '),
    fromText: (t) => t,
    isEmpty: (v) => stamp(v) === '',
    compare: (a, b) => stamp(a).localeCompare(stamp(b)),
};
const updatedType: FieldTypeDef = { ...createdType, type: 'updated', label: '최종 편집 일시' };
const idType: FieldTypeDef = {
    type: 'id', label: 'ID', icon: 'hash', readOnly: true, Cell: ReadonlyCell,
    defaultConfig: { prefix: '' },
    toText: (v, c) => (typeof v === 'number' ? `${(c as { prefix?: string })?.prefix ?? ''}${v}` : ''),
    fromText: (t) => t,
    isEmpty: (v) => typeof v !== 'number',
    compare: (a, b) => toNum(a) - toNum(b),
};

/** 내장 — 순서가 칸 추가 팝오버의 순서다. 🔴 relation 은 일부러 없다(P3 에 등록). */
export const BUILTIN_FIELD_TYPES: readonly FieldTypeDef[] = [
    textType, numberType, selectType, multiType, dateType, checkType,
    statusType, urlType, emailType, phoneType, createdType, updatedType, idType,
];
