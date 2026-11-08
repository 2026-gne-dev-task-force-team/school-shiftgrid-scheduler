/**
 * 셀 하나 — 칸 타입 레지스트리에서 정의를 찾아 그 Cell 에 넘긴다. 🔴 이 파일은 칸 종류를 모른다(switch 0) —
 *   내장 여섯도, 다른 꾸러미가 꽂은 타입도 같은 길을 탄다. 정의를 못 찾으면(꺼진 플러그인의 타입) 값 글자를 회색으로만 보인다.
 */
import { fieldTypes } from './fields/registry';
import { rawValue } from './logic';
import type { FieldOption, RecordCellValue, RecordField } from './contracts/record-view';

export function Cell({
    field,
    rowValue,
    editable,
    onChange,
    onOptionsChange,
}: {
    field: RecordField;
    /** 행 하나(셀은 [field.key] 로 읽는다) */
    rowValue: unknown;
    editable: boolean;
    onChange: (v: RecordCellValue) => void;
    onOptionsChange?: (options: FieldOption[]) => void;
}) {
    const def = fieldTypes.get(field.type);
    const value = rawValue(rowValue, field.key) as RecordCellValue | undefined;
    if (!def) {
        const t = value === null || value === undefined ? '' : Array.isArray(value) ? value.join(', ') : String(value);
        return (
            <div data-rv-cell={field.key} data-rv-orphan className="w-full h-full flex items-center px-2 text-[13px] text-muted truncate" title="이 칸 타입을 내놓던 플러그인이 꺼져 있습니다">
                {t || '(꺼진 타입)'}
            </div>
        );
    }
    const Impl = def.Cell;
    return (
        <Impl
            field={field}
            value={value}
            config={field.config}
            editable={editable}
            onChange={onChange}
            row={rowValue}
            onOptionsChange={def.hasOptions ? onOptionsChange : undefined}
        />
    );
}
