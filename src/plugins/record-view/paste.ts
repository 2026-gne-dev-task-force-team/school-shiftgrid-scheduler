import type { FieldOption, RecordCellValue, RecordField } from './contracts/record-view';
import { PILL_COLORS } from './colors';
import { fieldTypes } from './fields/registry';
import { newField } from './schema';

/**
 * 붙여넣기 — 엑셀·시트가 클립보드에 싣는 TSV 를 행렬로(순수). 표 편집기의 규칙을 「베낀다」(값 import 는 못 한다 — 구조 검사 ⑨).
 *   규칙: 탭=칸 · 줄바꿈=행 · 큰따옴표로 감싼 칸은 안의 탭·줄바꿈·`""` 를 글자로 · 끝의 빈 줄 하나는 버린다(엑셀이 붙인다) · CRLF 도 받는다.
 */
export function parseTsv(text: string): string[][] {
    const src = text.replace(/\r\n?/g, '\n');
    const rows: string[][] = [];
    let row: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (quoted) {
            if (c === '"') {
                if (src[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
            } else cur += c;
            continue;
        }
        if (c === '"' && cur === '') { quoted = true; continue; }
        if (c === '\t') { row.push(cur); cur = ''; continue; }
        if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; continue; }
        cur += c;
    }
    if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
    return rows;
}

export interface PastePlan {
    /** 붙여넣은 뒤의 칸 목록(모자란 칸을 글자 칸으로 만들고, 새 선택지를 덧붙였다) */
    fields: RecordField[];
    /** 새 행들 — 칸 key → 값 */
    rows: Record<string, RecordCellValue>[];
    /** 새로 만든 칸 수 */
    addedFields: number;
    /** 칸 목록이 바뀌었나 */
    fieldsChanged: boolean;
}

/**
 * 붙여넣은 글자 행렬 → 새 행 계획(순수). 열 i 는 keys[i] 칸으로 간다(보이는 칸 순서 — 첫 칸이 제목).
 *   keys[i] 가 null(칸이 모자람)이면 「칸 N」 글자 칸을 만든다. 값은 그 칸 타입의 fromText 로 — 모르는 선택지는 선택지로 만든다.
 *   🔴 빈 행(모든 칸이 빔)은 건너뛴다.
 */
export function buildPaste(fields: readonly RecordField[], keys: readonly (string | null)[], matrix: readonly string[][]): PastePlan {
    let next: RecordField[] = fields.map((f) => { const c: RecordField = { ...f }; if (f.options) c.options = [...f.options]; return c; });
    let added = 0;
    const colKeys = keys.map((k) => {
        if (k !== null && next.some((f) => f.key === k)) return k;
        const f = newField('text', `칸 ${next.length + 1}`);
        next = [...next, f];
        added += 1;
        return f.key;
    });
    let optionsChanged = false;
    const rows: Record<string, RecordCellValue>[] = [];
    for (const line of matrix) {
        if (line.every((c) => c.trim() === '')) continue;
        const values: Record<string, RecordCellValue> = {};
        colKeys.forEach((key, ci) => {
            const f = next.find((x) => x.key === key)!;
            const def = fieldTypes.get(f.type);
            const text = line[ci] ?? '';
            if (!def || text === '') return;
            const v = def.fromText(text, f.config, f);
            if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) return;
            values[key] = v;
            if (def.hasOptions) {
                for (const val of Array.isArray(v) ? v : [String(v)]) {
                    if (!f.options?.some((o: FieldOption) => o.value === val)) {
                        f.options = [...(f.options ?? []), { value: val, label: val, color: PILL_COLORS[((f.options?.length ?? 0) + 1) % PILL_COLORS.length] }];
                        optionsChanged = true;
                    }
                }
            }
        });
        rows.push(values);
    }
    return { fields: next, rows, addedFields: added, fieldsChanged: added > 0 || optionsChanged };
}
