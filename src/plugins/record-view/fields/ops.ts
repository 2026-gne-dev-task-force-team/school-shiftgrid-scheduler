/**
 * 필터 연산자 조각 — 칸 타입 정의의 toText·isEmpty 를 빌려 쓰는 순수 함수들.
 *   모든 타입이 가진 것(비어 있음·안 비어 있음·포함·미포함)은 여기서 만든다 — 타입 정의가 ops 를 안 주면 이 넷이 기본이다.
 */
import type { FieldTypeDef, FilterOpDef, RecordCellValue } from '../contracts/record-view';

export const toNum = (v: unknown): number =>
    typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;

/** 기본 빈 값 판정 — null·undefined·공백 글자·NaN·빈 배열 */
export function defaultIsEmpty(v: RecordCellValue | undefined): boolean {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (typeof v === 'number') return Number.isNaN(v);
    if (Array.isArray(v)) return v.length === 0;
    return false;
}

export function isEmptyOf(def: FieldTypeDef | undefined, v: RecordCellValue | undefined, config: unknown): boolean {
    return def?.isEmpty ? def.isEmpty(v, config) : defaultIsEmpty(v);
}

/** 모든 타입 공통 연산자 넷 — def 의 toText·isEmpty 를 닫아 둔다. */
export function universalOps(def: FieldTypeDef): { empty: FilterOpDef; notEmpty: FilterOpDef; contains: FilterOpDef; notContains: FilterOpDef } {
    const text = (v: RecordCellValue | undefined, c: unknown, f: Parameters<FilterOpDef['match']>[3]) => def.toText(v, c, f).toLowerCase();
    return {
        empty: { id: 'empty', label: '비어 있음', needsValue: false, match: (v, _a, c) => isEmptyOf(def, v, c) },
        notEmpty: { id: 'notEmpty', label: '안 비어 있음', needsValue: false, match: (v, _a, c) => !isEmptyOf(def, v, c) },
        contains: { id: 'contains', label: '포함', needsValue: true, match: (v, a, c, f) => text(v, c, f).includes(String(a ?? '').toLowerCase()) },
        notContains: { id: 'notContains', label: '미포함', needsValue: true, match: (v, a, c, f) => !text(v, c, f).includes(String(a ?? '').toLowerCase()) },
    };
}

/** 타입이 ops 를 안 주면 — 포함·비어 있음·안 비어 있음 */
export function opsOf(def: FieldTypeDef): FilterOpDef[] {
    if (def.ops) return def.ops;
    const u = universalOps(def);
    return [u.contains, u.empty, u.notEmpty];
}
