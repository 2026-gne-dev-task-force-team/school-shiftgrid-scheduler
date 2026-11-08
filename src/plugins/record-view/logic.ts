/**
 * 레코드 뷰 순수 로직 — 필터·정렬·검색을 React 0줄로 둔다(vitest 가 덮는다).
 *
 * 🔴 「됐다」의 자리: 화면이 보여 주는 행 순서는 전부 여기서 난다. 타입별 비교·빈 값 순서·multi 포함 판정이
 *    여기 한곳에 모여 있어야 한눈에 검산된다. 🔴 ⛔ 도메인을 모른다 — 칸 종류(FieldType)로만 가른다.
 */
import type { FieldType, FilterOp, FilterRule, RecordField, RecordViewState, SortRule } from './contracts/record-view';

/** 행 하나를 「key→값」 사전으로 본다(T 가 무엇이든 셀은 [key] 로 읽는다). */
function row(r: unknown): Record<string, unknown> {
    return (r ?? {}) as Record<string, unknown>;
}

/** 한 셀의 날것 값 */
export function rawValue(r: unknown, key: string): unknown {
    return row(r)[key];
}

/** 빈 값인가 — 타입마다 「비었다」가 다르다. check(boolean) 는 false 도 값이라 안 비었다로 본다. */
export function isEmptyValue(v: unknown, type: FieldType): boolean {
    if (v === null || v === undefined) return true;
    if (type === 'check') return false;              // false 는 「꺼짐」이라는 값이다
    if (type === 'multi') return !Array.isArray(v) || v.length === 0;
    if (typeof v === 'string') return v.trim() === '';
    if (typeof v === 'number') return Number.isNaN(v);
    if (Array.isArray(v)) return v.length === 0;
    return false;
}

/** 숫자로 — 숫자면 그대로, 문자열이면 파싱, 아니면 NaN */
export function toNumber(v: unknown): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') return Number(v);
    return Number.NaN;
}

/** 옵션 값 → 보이는 라벨(없으면 값 그대로) */
function optionLabel(field: RecordField, value: string): string {
    return field.options?.find((o) => o.value === value)?.label ?? value;
}

/** 검색·정렬에 쓰는 「보이는 글자」 — select·multi 는 라벨로, check 는 ✓/'' 로 편다. */
export function displayText(r: unknown, field: RecordField): string {
    const v = rawValue(r, field.key);
    if (v === null || v === undefined) return '';
    switch (field.type) {
        case 'check':
            return v ? '✓' : '';
        case 'multi':
            return Array.isArray(v) ? v.map((x) => optionLabel(field, String(x))).join(', ') : '';
        case 'select':
            return optionLabel(field, String(v));
        case 'number':
            return typeof v === 'number' && Number.isNaN(v) ? '' : String(v);
        default:
            return String(v);
    }
}

/** 한 칸 기준 두 행 비교 — 빈 값은 방향과 무관하게 **항상 끝으로**(노션 규칙). */
export function compareByField(a: unknown, b: unknown, field: RecordField, dir: 'asc' | 'desc'): number {
    const va = rawValue(a, field.key);
    const vb = rawValue(b, field.key);
    const ea = isEmptyValue(va, field.type);
    const eb = isEmptyValue(vb, field.type);
    if (ea && eb) return 0;
    if (ea) return 1;        // a 가 비었으면 뒤로
    if (eb) return -1;       // b 가 비었으면 뒤로
    let c: number;
    if (field.type === 'number') {
        c = toNumber(va) - toNumber(vb);
    } else if (field.type === 'check') {
        c = (va ? 1 : 0) - (vb ? 1 : 0);
    } else {
        // text·select·multi·date 는 보이는 글자로(date 는 ISO 라 글자 비교 = 시간 순)
        c = displayText(a, field).localeCompare(displayText(b, field), 'ko');
    }
    if (c === 0) return 0;
    return dir === 'desc' ? -c : c;
}

/** 다중 정렬 — 앞선 규칙이 먼저. 동률이면 원래 순서 유지(안정). */
export function applySorts<T>(rows: readonly T[], byKey: Map<string, RecordField>, sorts: readonly SortRule[]): T[] {
    const live = sorts.filter((s) => byKey.has(s.key));
    if (live.length === 0) return rows.slice();
    return rows
        .map((r, i) => [r, i] as const)
        .sort((A, B) => {
            for (const s of live) {
                const c = compareByField(A[0], B[0], byKey.get(s.key)!, s.dir);
                if (c !== 0) return c;
            }
            return A[1] - B[1];
        })
        .map(([r]) => r);
}

/** 어떤 연산자를 이 타입이 쓰나 — 필터 UI 가 고를 수 있는 목록을 이걸로 만든다. */
export function opsFor(type: FieldType): FilterOp[] {
    switch (type) {
        case 'text':
            return ['contains', 'notContains', 'eq', 'ne', 'empty', 'notEmpty'];
        case 'number':
            return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty'];
        case 'select':
            return ['eq', 'ne', 'empty', 'notEmpty'];
        case 'multi':
            return ['has', 'notHas', 'empty', 'notEmpty'];
        case 'date':
            return ['eq', 'before', 'after', 'empty', 'notEmpty'];
        case 'check':
            return ['isTrue', 'isFalse'];
    }
}

/** 값이 없는 연산자(empty·notEmpty·isTrue·isFalse) — 필터 UI 가 값칸을 숨긴다. */
export function opNeedsValue(op: FilterOp): boolean {
    return op !== 'empty' && op !== 'notEmpty' && op !== 'isTrue' && op !== 'isFalse';
}

/** 필터 한 줄 판정 */
export function matchesRule(r: unknown, field: RecordField, rule: FilterRule): boolean {
    const v = rawValue(r, field.key);
    const empty = isEmptyValue(v, field.type);
    switch (rule.op) {
        case 'empty':
            return empty;
        case 'notEmpty':
            return !empty;
        case 'isTrue':
            return !!v;
        case 'isFalse':
            return !v;
        case 'contains':
            return displayText(r, field).toLowerCase().includes(String(rule.value ?? '').toLowerCase());
        case 'notContains':
            return !displayText(r, field).toLowerCase().includes(String(rule.value ?? '').toLowerCase());
        case 'eq':
            if (empty) return false;
            if (field.type === 'number') return toNumber(v) === toNumber(rule.value);
            return String(v) === String(rule.value ?? '');
        case 'ne':
            if (field.type === 'number') return toNumber(v) !== toNumber(rule.value);
            return String(v ?? '') !== String(rule.value ?? '');
        case 'gt':
            return !empty && toNumber(v) > toNumber(rule.value);
        case 'gte':
            return !empty && toNumber(v) >= toNumber(rule.value);
        case 'lt':
            return !empty && toNumber(v) < toNumber(rule.value);
        case 'lte':
            return !empty && toNumber(v) <= toNumber(rule.value);
        case 'before':
            return !empty && String(v) < String(rule.value ?? '');
        case 'after':
            return !empty && String(v) > String(rule.value ?? '');
        case 'has':
            return Array.isArray(v) && v.map(String).includes(String(rule.value ?? ''));
        case 'notHas':
            return !(Array.isArray(v) && v.map(String).includes(String(rule.value ?? '')));
    }
}

/** 검색 판정 — 모든 칸의 보이는 글자를 이어 붙여 포함 검사(대소문자 무시). */
export function matchesSearch(r: unknown, fields: readonly RecordField[], q: string): boolean {
    const needle = q.trim().toLowerCase();
    if (needle === '') return true;
    return fields.some((f) => displayText(r, f).toLowerCase().includes(needle));
}

/**
 * 화면에 보일 행을 만든다 — 필터(AND) → 검색 → 정렬. 바깥 records 는 안 바꾼다(새 배열).
 *   🔴 칸 정의에 없는 key 를 가리키는 필터·정렬은 조용히 건너뛴다(칸이 바뀌어도 안 깨진다).
 */
export function deriveRows<T>(records: readonly T[], fields: readonly RecordField[], state: RecordViewState): T[] {
    const byKey = new Map(fields.map((f) => [f.key, f]));
    let rows = records.filter((r) =>
        state.filters.every((rule) => {
            const f = byKey.get(rule.key);
            return !f || matchesRule(r, f, rule);
        }),
    );
    if (state.search.trim() !== '') {
        rows = rows.filter((r) => matchesSearch(r, fields, state.search));
    }
    return applySorts(rows, byKey, state.sorts);
}
