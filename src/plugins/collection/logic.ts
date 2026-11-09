/**
 * 레코드 뷰 순수 로직 — 필터·정렬·검색을 React 0줄로 둔다(vitest 가 덮는다).
 *
 * 🔴 「됐다」의 자리: 화면이 보여 주는 행 순서는 전부 여기서 난다. 타입별 비교·빈 값 순서·연산자 판정은
 *    칸 타입 정의(fields/)가 쥐고 여기는 레지스트리에서 조회해 파이프라인만 짠다. 🔴 ⛔ 도메인을 모른다.
 */
import type {
    FilterNode, FilterOpDef, FilterRule, RecordCellValue, RecordField, SortRule,
} from './contracts/collection';
import { fieldTypes } from './fields/registry';
import { isEmptyOf, opsOf, toNum } from './fields/ops';

/** 행 하나를 「key→값」 사전으로 본다(T 가 무엇이든 셀은 [key] 로 읽는다). */
function row(r: unknown): Record<string, unknown> {
    return (r ?? {}) as Record<string, unknown>;
}

/** 한 셀의 날것 값 */
export function rawValue(r: unknown, key: string): unknown {
    return row(r)[key];
}

const cell = (r: unknown, key: string): RecordCellValue | undefined => rawValue(r, key) as RecordCellValue | undefined;

/** 빈 값인가 — 타입마다 「비었다」가 다르다(레지스트리의 isEmpty). 모르는 타입은 기본 판정. */
export function isEmptyValue(v: unknown, type: string, config?: unknown): boolean {
    return isEmptyOf(fieldTypes.get(type), v as RecordCellValue | undefined, config);
}

/** 숫자로 — 숫자면 그대로, 문자열이면 파싱, 아니면 NaN */
export function toNumber(v: unknown): number {
    return toNum(v);
}

/** 검색·정렬·복사에 쓰는 「보이는 글자」 — 타입의 toText. 모르는 타입(꺼진 플러그인)은 값을 그대로 글자로. */
export function displayText(r: unknown, field: RecordField): string {
    const v = cell(r, field.key);
    const def = fieldTypes.get(field.type);
    if (def) return def.toText(v, field.config, field);
    return v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v);
}

/** 한 칸 기준 두 행 비교 — 빈 값은 방향과 무관하게 **항상 끝으로**(노션 규칙). */
export function compareByField(a: unknown, b: unknown, field: RecordField, dir: 'asc' | 'desc'): number {
    const va = cell(a, field.key);
    const vb = cell(b, field.key);
    const def = fieldTypes.get(field.type);
    const ea = isEmptyOf(def, va, field.config);
    const eb = isEmptyOf(def, vb, field.config);
    if (ea && eb) return 0;
    if (ea) return 1;        // a 가 비었으면 뒤로
    if (eb) return -1;       // b 가 비었으면 뒤로
    const c = def?.compare
        ? def.compare(va, vb, field.config, field)
        : displayText(a, field).localeCompare(displayText(b, field), 'ko');   // 글자 비교(날짜는 ISO 라 글자 순 = 시간 순)
    if (c === 0 || Number.isNaN(c)) return 0;
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

/** 이 칸 타입이 쓰는 연산자 정의 목록 — 필터 UI 가 이걸로 고를 수 있는 목록을 만든다. */
export function opDefsFor(type: string): FilterOpDef[] {
    const def = fieldTypes.get(type);
    return def ? opsOf(def) : [];
}

/** 연산자 id 목록 */
export function opsFor(type: string): string[] {
    return opDefsFor(type).map((o) => o.id);
}

/** 값이 필요한 연산자인가 — 칸 타입을 알면 그 정의를, 모르면 id 로 짐작한다(비어 있음·켜짐 …은 값이 없다). */
export function opNeedsValue(op: string, type?: string): boolean {
    if (type) {
        const d = opDefsFor(type).find((o) => o.id === op);
        if (d) return d.needsValue;
    }
    return !['empty', 'notEmpty', 'isTrue', 'isFalse'].includes(op);
}

/** 필터 한 줄 판정 — 칸 타입 정의의 연산자. 모르는 타입·연산자는 통과(행을 조용히 숨기지 않는다). */
export function matchesRule(r: unknown, field: RecordField, rule: FilterRule): boolean {
    const def = fieldTypes.get(field.type);
    if (!def) return true;
    const o = opsOf(def).find((x) => x.id === rule.op);
    return o ? o.match(cell(r, field.key), rule.value, field.config, field) : true;
}

/** 필터 규칙 하나인가(and/or 묶음이 아닌가) */
export function isRule(n: FilterNode): n is FilterRule {
    return !!n && typeof n === 'object' && 'op' in n && 'key' in n;
}

/** 빈 필터 */
export const EMPTY_FILTER: FilterNode = { and: [] };

function kidsOf(node: FilterNode): FilterNode[] {
    if (isRule(node)) return [];
    return 'and' in node ? node.and : node.or;
}

/**
 * 필터 판정 — 규칙 · and 묶음 · or 묶음. 칸이 없는 규칙은 통과(칸이 바뀌어도 안 깨진다).
 *   and 가 비면 참 · or 가 비면 참(「조건 없음」).
 */
export function evalFilter(node: FilterNode, byKey: ReadonlyMap<string, RecordField>, r: unknown): boolean {
    if (isRule(node)) {
        const f = byKey.get(node.key);
        return !f || matchesRule(r, f, node);
    }
    if ('and' in node) return node.and.every((c) => evalFilter(c, byKey, r));
    return node.or.length === 0 || node.or.some((c) => evalFilter(c, byKey, r));
}

/** 필터에 규칙이 하나도 없나 */
export function filterIsEmpty(node: FilterNode): boolean {
    if (isRule(node)) return false;
    return kidsOf(node).every(filterIsEmpty);
}

/** 위쪽 and 줄에 있는 규칙들만(툴바가 편집하는 평평한 목록). 묶음은 건너뛴다. */
export function flatRules(node: FilterNode): FilterRule[] {
    if (isRule(node)) return [node];
    if ('and' in node) return node.and.filter(isRule);
    return [];
}

/** 평평한 규칙 목록으로 필터를 갈아 끼운다 — 위쪽 and 줄의 묶음(or 그룹)은 그대로 보존한다. */
export function withFlatRules(node: FilterNode, rules: FilterRule[]): FilterNode {
    const groups = isRule(node) ? [] : 'and' in node ? node.and.filter((c) => !isRule(c)) : [node];
    return { and: [...rules, ...groups] };
}

/** 필터 정규화 — 모르는 모양을 버리고 🔴 2단까지만 둔다(묶음 속 묶음은 버린다). */
export function normalizeFilter(raw: unknown, depth = 0): FilterNode {
    if (!raw || typeof raw !== 'object') return { and: [] };
    const o = raw as Record<string, unknown>;
    if (typeof o.key === 'string' && typeof o.op === 'string') {
        const rule: FilterRule = { key: o.key, op: o.op };
        if (typeof o.value === 'string' || typeof o.value === 'number') rule.value = o.value;
        return rule;
    }
    const kind = Array.isArray(o.and) ? 'and' : Array.isArray(o.or) ? 'or' : null;
    if (!kind) return { and: [] };
    const kids = (o[kind] as unknown[])
        .map((k) => normalizeFilter(k, depth + 1))
        .filter((k) => isRule(k) || (depth < 1 && !filterIsEmpty(k)));   // depth 0(최상위)의 자식만 묶음을 가질 수 있다 → 2단
    return kind === 'and' ? { and: kids } : { or: kids };
}

/** 그 칸을 가리키는 규칙을 필터에서 뺀다(칸을 지웠을 때) — 묶음 속까지 훑고 비게 된 묶음은 버린다. */
export function pruneFilter(node: FilterNode, key: string): FilterNode {
    if (isRule(node)) return node;
    const kids = kidsOf(node)
        .filter((c) => !(isRule(c) && c.key === key))
        .map((c) => pruneFilter(c, key))
        .filter((c) => isRule(c) || !filterIsEmpty(c));
    return 'and' in node ? { and: kids } : { or: kids };
}

/** 검색 판정 — 모든 칸의 보이는 글자를 이어 붙여 포함 검사(대소문자 무시). */
export function matchesSearch(r: unknown, fields: readonly RecordField[], q: string): boolean {
    const needle = q.trim().toLowerCase();
    if (needle === '') return true;
    return fields.some((f) => displayText(r, f).toLowerCase().includes(needle));
}

/** deriveRows 가 먹는 보기 — ViewDef 의 일부 + 잠시 상태(검색어) */
export interface DeriveInput {
    search: string;
    filter: FilterNode;
    sorts: readonly SortRule[];
}

/**
 * 화면에 보일 행을 만든다 — 필터(AND/OR 2단) → 검색 → 정렬. 바깥 records 는 안 바꾼다(새 배열).
 *   🔴 칸 정의에 없는 key 를 가리키는 필터·정렬은 조용히 건너뛴다(칸이 바뀌어도 안 깨진다). 행 배열이 나오는 단 한 곳이다.
 */
export function deriveRows<T>(records: readonly T[], fields: readonly RecordField[], input: DeriveInput): T[] {
    const byKey = new Map(fields.map((f) => [f.key, f]));
    let rows = filterIsEmpty(input.filter) ? records.slice() : records.filter((r) => evalFilter(input.filter, byKey, r));
    if (input.search.trim() !== '') {
        rows = rows.filter((r) => matchesSearch(r, fields, input.search));
    }
    return applySorts(rows, byKey, input.sorts);
}

/** 새로 들어온 행 id — 첫 렌더(prev 없음)·한꺼번에 많이 바뀜(보기 갈아끼움)이면 비운다(전부 튀면 산만하다). 필터·정렬은 records 를 안 바꾸니 여기 안 걸린다 */
export function freshIds(prev: ReadonlySet<string> | null, ids: readonly string[], max = 20): Set<string> {
    if (!prev) return new Set();
    const added = ids.filter((id) => !prev.has(id));
    return added.length > max ? new Set() : new Set(added);
}

/**
 * 행 끌기 놓은 자리 번역(Q8) — 행 사각형 안의 y 위치로 「앞·뒤·하위」. 포인터 좌표만 받는 순수 함수라 터치·마우스가 같다.
 *   하위로 넣을 수 있으면(canNest) 위 25% = 앞 · 아래 25% = 뒤 · 가운데 = 하위. 못 넣으면 반으로 갈라 앞/뒤.
 */
export function rowDropZone(y: number, top: number, height: number, canNest: boolean): 'before' | 'into' | 'after' {
    const f = height > 0 ? (y - top) / height : 0.5;
    if (!canNest) return f < 0.5 ? 'before' : 'after';
    return f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'into';
}
