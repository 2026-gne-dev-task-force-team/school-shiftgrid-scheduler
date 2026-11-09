/**
 * 칸 옵션 「유일」(Q11 W10) — 같은 칸에 같은 값이 두 줄에 못 들어간다. 순수 함수만(화면·저장 0).
 *   🔴 비교는 글자 앞뒤 공백·대소문자를 무시한다(「Kim」 과 「 kim 」 은 같은 값). 빈 값은 겹침으로 안 센다(여러 줄이 비어 있어도 된다).
 */
import type { CellChange, RecordCellValue } from './contracts/collection';

/** 비교용 값 — 빈 값이면 null(겹침 판정에서 빠진다). */
export function uniqueKeyOf(v: RecordCellValue | undefined): string | null {
    if (v == null) return null;
    if (typeof v === 'string') { const t = v.trim().toLowerCase(); return t === '' ? null : `s:${t}`; }
    if (typeof v === 'number' || typeof v === 'boolean') return `${typeof v}:${String(v)}`;
    if (Array.isArray(v)) return v.length === 0 ? null : `a:${v.map((x) => String(x).trim().toLowerCase()).sort().join('\u0001')}`;
    return `j:${JSON.stringify(v)}`;
}

/** 그 값이 다른 줄과 겹치나 — 겹치는 줄 id(없으면 null). 자기 줄(selfId)은 뺀다. */
export function findUniqueConflict(
    value: RecordCellValue | undefined,
    others: readonly { id: string; value: RecordCellValue | undefined }[],
    selfId: string | null,
): string | null {
    const k = uniqueKeyOf(value);
    if (k === null) return null;
    const hit = others.find((o) => o.id !== selfId && uniqueKeyOf(o.value) === k);
    return hit ? hit.id : null;
}

/** 이미 겹친 값이 있나 — 「유일」을 켜기 전에 본다. 겹친 값(보기용 글) 하나를 돌려준다(없으면 null). */
export function firstDuplicate(values: readonly (RecordCellValue | undefined)[]): string | null {
    const seen = new Set<string>();
    for (const v of values) {
        const k = uniqueKeyOf(v);
        if (k === null) continue;
        if (seen.has(k)) return Array.isArray(v) ? v.join(', ') : String(v);
        seen.add(k);
    }
    return null;
}

/**
 * 여러 칸 쓰기 묶음을 거른다 — 유일 칸에 겹치는 값을 쓰는 변경은 뺀다(묶음 안끼리 겹쳐도 뒤엣것을 뺀다).
 *   rows: 지금 값(id → 칸 값 읽기) · uniqueKeys: 유일이 켜진 칸 key.
 */
export function filterUniqueChanges(
    changes: readonly CellChange[],
    ids: readonly string[],
    read: (id: string, key: string) => RecordCellValue | undefined,
    uniqueKeys: ReadonlySet<string>,
): { kept: CellChange[]; rejected: CellChange[] } {
    const kept: CellChange[] = [];
    const rejected: CellChange[] = [];
    // 칸별 「바뀐 뒤」 장부 — 값→줄 id 와 줄 id→값 키 두 Map(변경마다 줄 전체를 훑지 않는다: O(n+m))
    interface Ledger { byKey: Map<string, string>; byId: Map<string, string | null> }
    const ledgers = new Map<string, Ledger>();
    const ledger = (key: string): Ledger => {
        let l = ledgers.get(key);
        if (!l) {
            l = { byKey: new Map(), byId: new Map() };
            for (const id of ids) {
                const k = uniqueKeyOf(read(id, key));
                l.byId.set(id, k);
                if (k !== null && !l.byKey.has(k)) l.byKey.set(k, id);
            }
            ledgers.set(key, l);
        }
        return l;
    };
    for (const c of changes) {
        if (!uniqueKeys.has(c.key)) { kept.push(c); continue; }
        const l = ledger(c.key);
        const k = uniqueKeyOf(c.value);
        const hit = k === null ? undefined : l.byKey.get(k);
        if (hit !== undefined && hit !== c.id) { rejected.push(c); continue; }
        const old = l.byId.get(c.id) ?? null;
        if (old !== null && l.byKey.get(old) === c.id) l.byKey.delete(old);
        if (k !== null) l.byKey.set(k, c.id);
        l.byId.set(c.id, k);
        kept.push(c);
    }
    return { kept, rejected };
}

/** 붙여넣기 비교용 — 붙일 값은 아직 글이라 기존 값도 글로 바꿔 잰다(숫자 3 과 글 「3」 은 같다). */
function textKeyOf(v: RecordCellValue | undefined): string | null {
    if (v == null) return null;
    const t = (Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? (v.end ? `${v.start}→${v.end}` : v.start) : String(v)).trim().toLowerCase();
    return t === '' ? null : t;
}

/**
 * 붙여넣기 행렬을 거른다 — 유일 칸 열에서 기존 값·앞서 붙인 줄과 겹치는 칸을 비운다(그 칸만 건너뛴다 · 줄은 만든다).
 *   keys[i] = i번째 열이 갈 칸 key(null 이면 새 칸 — 유일일 수 없다). 돌려주는 skipped = 비운 칸 수.
 */
export function filterUniquePaste(
    keys: readonly (string | null)[],
    matrix: readonly string[][],
    existing: (key: string) => readonly (RecordCellValue | undefined)[],
    uniqueKeys: ReadonlySet<string>,
): { rows: string[][]; skipped: number } {
    let skipped = 0;
    const seen = new Map<number, Set<string>>();
    keys.forEach((k, i) => {
        if (k && uniqueKeys.has(k)) seen.set(i, new Set(existing(k).map(textKeyOf).filter((x): x is string => x !== null)));
    });
    const rows = matrix.map((line) => line.map((cell, i) => {
        const s = seen.get(i);
        if (!s) return cell;
        const k = textKeyOf(cell);
        if (k === null) return cell;
        if (s.has(k)) { skipped += 1; return ''; }
        s.add(k);
        return cell;
    }));
    return { rows, skipped };
}
