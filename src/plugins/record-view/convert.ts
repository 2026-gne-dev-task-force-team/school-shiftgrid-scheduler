/**
 * 칸 타입 변환 계획 — 값을 안 바꾸고 「무엇이 어떻게 바뀌고 몇 행이 깎이나」만 계산한다(순수).
 *
 * 🔴 이 앱에서 되돌릴 수 없는(확인이 필요한) 유일한 조작이 이것이다 — 그래서 계산과 적용을 가른다:
 *    화면이 plan.lost 를 보고 「N행의 값이 비워집니다」를 보여 준 뒤에야 적용한다(적용은 되돌리기 한 칸).
 *
 * 규칙: 기본은 fromText(toText(옛 값)). 선택지 타입으로 갈 때는 글자와 같은 선택지가 없으면 만든다(노션과 같다).
 *   「깎임」= 옛 글자가 있는데 새 값의 글자가 그것과 다르다 — `12a` → 숫자(빈 값) · 무엇이든 → 체크(✓ 하나) · 여러 개 → 하나.
 */
import type { ConvertPlan, FieldOption, RecordCellValue, RecordField } from './contracts/record-view';
import { PILL_COLORS } from '../../pane-ui-system';
import { fieldTypes } from './fields/registry';

export function planConvert(
    rows: readonly { id: string; value: RecordCellValue | undefined }[],
    field: RecordField,
    toType: string,
): ConvertPlan {
    const from = fieldTypes.get(field.type);
    const to = fieldTypes.get(toType);
    if (!to || toType === field.type) return { key: field.key, field, changes: [], lost: 0 };

    // 새 칸 정의 — 선택지는 선택지 타입끼리만 이어 가고, 그 밖엔 버린다(아래에서 값에서 다시 만든다)
    const next: RecordField = { ...field, type: toType, config: to.defaultConfig };
    if (!to.hasOptions) delete next.options;
    else next.options = from?.hasOptions ? [...(field.options ?? [])] : [];
    if (next.config === undefined) delete next.config;

    const options: FieldOption[] = next.options ?? [];
    const ensureOption = (value: string) => {
        if (!to.hasOptions || options.some((o) => o.value === value)) return;
        options.push({ value, label: value, color: PILL_COLORS[(options.length + 1) % PILL_COLORS.length] });
    };

    const changes: ConvertPlan['changes'] = [];
    let lost = 0;
    for (const r of rows) {
        const oldText = from ? from.toText(r.value, field.config, field) : r.value == null ? '' : String(r.value);
        if (oldText.trim() === '') continue;   // 비어 있던 칸은 바꿀 것도 깎일 것도 없다(체크의 꺼짐도 같다)
        let made: RecordCellValue;
        if (from?.hasOptions && to.hasOptions) {
            // 선택지 타입끼리는 글자를 거치지 않고 값을 직접 옮긴다(라벨에 쉼표가 있어도 안 쪼개진다)
            const arr = Array.isArray(r.value) ? r.value : r.value == null || r.value === '' ? [] : [String(r.value)];
            made = toType === 'multi' || to.type === 'multi' ? arr : (arr[0] ?? null);
            if (arr.length > 1 && !(to.type === 'multi')) lost += 1;
        } else {
            made = to.fromText(oldText, next.config, next);
            if (to.toText(made, next.config, next).trim() !== oldText.trim()) lost += 1;
        }
        if (to.hasOptions) {
            for (const v of Array.isArray(made) ? made : typeof made === 'string' && made !== '' ? [made] : []) ensureOption(v);
        }
        if (JSON.stringify(made) !== JSON.stringify(r.value ?? null)) changes.push({ id: r.id, value: made });
    }
    return { key: field.key, field: next, changes, lost };
}
