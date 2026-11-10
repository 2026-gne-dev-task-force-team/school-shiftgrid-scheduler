import type { FieldOption, RecordCellValue, RecordField } from './contracts/collection';
import { PILL_COLORS } from '../../pane-ui-system';
import { fieldTypes } from './fields/registry';
import { newField } from './schema';

/** 붙여넣기 계획 — TSV 해석은 창틀 `parseClipboard` 가 한 벌(표 편집기와 같은 규칙). 여기는 행렬 → 새 행·칸 계획만. */
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
 * 첫 줄이 머리글인가 — 제목 칸 이름표가 그 줄에 있으면 머리글로 본다(엑셀은 보통 머리글째 복사한다).
 *   머리글이면 열마다 이름표가 같은 칸 key(모르는 열은 null)를, 아니면 null 을 준다. 숨긴 칸도 이름표로 찾는다.
 */
export function headerKeys(fields: readonly RecordField[], titleKey: string, first: readonly string[]): (string | null)[] | null {
    const byLabel = new Map(fields.map((f) => [f.label.trim(), f.key]));
    const keys = first.map((c) => byLabel.get(c.trim()) ?? null);
    return keys.includes(titleKey) ? keys : null;
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
