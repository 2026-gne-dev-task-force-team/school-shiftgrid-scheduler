/**
 * 칸 가지치기 — 줄·열이 사라지면 그 칸 글자도 같이 버린다.
 * ops.ts 와 components/* 양쪽이 쓴다(둘 다 model.ts 만 알면 되게 — 순환 참조를 피한다).
 */
import type { CellValue } from './model';

export function pruneCells(
    cells: Record<string, CellValue>,
    validColKeys: string[],
    validRowKeys: string[],
): Record<string, CellValue> {
    const okCol = new Set(validColKeys);
    const okRow = new Set(validRowKeys);
    const out: Record<string, CellValue> = {};
    for (const [k, v] of Object.entries(cells)) {
        const i = k.indexOf(':');
        if (i < 0) continue;
        const c = k.slice(0, i);
        const r = k.slice(i + 1);
        if (okCol.has(c) && okRow.has(r)) out[k] = v;
    }
    return out;
}
