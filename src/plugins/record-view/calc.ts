/**
 * 계산 행 — 노션 「계산」 16종(순수). 표에 보이는 행(필터 뒤)의 한 칸 값들을 받아 보이는 글자를 낸다.
 *   🔴 빈 값 규칙(노션): 개수 외 함수는 빈 값을 빼고 잰다 · 값이 하나도 없으면 ''(셀은 「계산」만 보인다).
 *   숫자 함수는 filterInput 'number' 칸, 날짜 함수는 'date' 칸에만 뜬다(타입 이름을 모른다).
 */
import type { RecordCellValue, RecordField } from './contracts/record-view';
import { fieldTypes } from './fields/registry';
import { isEmptyOf, toNum } from './fields/ops';
import { formatNumber } from './fields/format';
import { toDateValue } from './fields/dates';

type V = RecordCellValue | undefined;
export interface CalcFn { id: string; label: string; kind: 'any' | 'number' | 'date'; run(vals: V[], field: RecordField): string }

const pct = (a: number, b: number) => (b === 0 ? '' : `${Math.round((a / b) * 1000) / 10}%`);
const empty = (v: V, f: RecordField) => isEmptyOf(fieldTypes.get(f.type), v, f.config);
const nums = (vals: V[]) => vals.map(toNum).filter((n) => !Number.isNaN(n));
const num = (n: number | undefined, f: RecordField) => (n === undefined || Number.isNaN(n) ? '' : formatNumber(Math.round(n * 1e6) / 1e6, f.config));
const days = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
const starts = (vals: V[]) => vals.map((v) => toDateValue(v)?.start).filter((s): s is string => !!s).sort();
/** 여러 개 칸은 낱값을 하나씩 센다(노션의 「값 개수」) */
const items = (vals: V[], f: RecordField) => vals.filter((v) => !empty(v, f)).flatMap((v) => (Array.isArray(v) ? v : [v]));

export const CALC_FNS: CalcFn[] = [
    { id: 'count', label: '모두 세기', kind: 'any', run: (vs) => String(vs.length) },
    { id: 'values', label: '값 세기', kind: 'any', run: (vs, f) => String(items(vs, f).length) },
    { id: 'unique', label: '고유값 세기', kind: 'any', run: (vs, f) => String(new Set(items(vs, f).map((x) => JSON.stringify(x))).size) },
    { id: 'empty', label: '빈 칸 세기', kind: 'any', run: (vs, f) => String(vs.filter((v) => empty(v, f)).length) },
    { id: 'notEmpty', label: '안 빈 칸 세기', kind: 'any', run: (vs, f) => String(vs.filter((v) => !empty(v, f)).length) },
    { id: 'pctEmpty', label: '빈 칸 비율', kind: 'any', run: (vs, f) => pct(vs.filter((v) => empty(v, f)).length, vs.length) },
    { id: 'pctNotEmpty', label: '안 빈 칸 비율', kind: 'any', run: (vs, f) => pct(vs.filter((v) => !empty(v, f)).length, vs.length) },
    { id: 'sum', label: '합계', kind: 'number', run: (vs, f) => { const n = nums(vs); return n.length ? num(n.reduce((a, b) => a + b, 0), f) : ''; } },
    { id: 'avg', label: '평균', kind: 'number', run: (vs, f) => { const n = nums(vs); return n.length ? num(n.reduce((a, b) => a + b, 0) / n.length, f) : ''; } },
    { id: 'median', label: '중앙값', kind: 'number', run: (vs, f) => {
        const n = nums(vs).sort((a, b) => a - b);
        if (!n.length) return '';
        const h = Math.floor(n.length / 2);
        return num(n.length % 2 ? n[h] : (n[h - 1] + n[h]) / 2, f);
    } },
    { id: 'min', label: '최솟값', kind: 'number', run: (vs, f) => { const n = nums(vs); return n.length ? num(Math.min(...n), f) : ''; } },
    { id: 'max', label: '최댓값', kind: 'number', run: (vs, f) => { const n = nums(vs); return n.length ? num(Math.max(...n), f) : ''; } },
    { id: 'range', label: '범위', kind: 'number', run: (vs, f) => { const n = nums(vs); return n.length ? num(Math.max(...n) - Math.min(...n), f) : ''; } },
    { id: 'earliest', label: '가장 이른 날짜', kind: 'date', run: (vs) => (starts(vs)[0] ?? '').replace('T', ' ') },
    { id: 'latest', label: '가장 늦은 날짜', kind: 'date', run: (vs) => (starts(vs).at(-1) ?? '').replace('T', ' ') },
    { id: 'dateRange', label: '날짜 범위', kind: 'date', run: (vs) => { const s = starts(vs); return s.length ? `${days(s[0], s[s.length - 1])}일` : ''; } },
];

/** 이 칸에 고를 수 있는 함수들 */
export function calcFnsFor(field: RecordField): CalcFn[] {
    const input = fieldTypes.get(field.type)?.filterInput;
    return CALC_FNS.filter((c) => c.kind === 'any' || c.kind === input);
}

/** 계산 — 모르는 id·안 맞는 칸이면 '' */
export function runCalc(id: string | undefined, vals: V[], field: RecordField): string {
    const fn = id ? calcFnsFor(field).find((c) => c.id === id) : undefined;
    return fn ? fn.run(vals, field) : '';
}
