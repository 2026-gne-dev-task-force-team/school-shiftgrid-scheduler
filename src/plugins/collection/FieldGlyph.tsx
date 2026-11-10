/** 칸 머리·속성 줄의 칸 표시 — 칸에 이모지 아이콘이 있으면 그것, 없으면 타입 아이콘(C1). 표와 속성 목록이 한 부품을 쓴다. */
import { Icon, NodeIcon } from '../../pane-ui-system';
import { fieldTypes } from './fields/registry';
import type { RecordField } from './contracts/collection';

export function FieldGlyph({ field, size = 13 }: { field: RecordField; size?: number }) {
    if (field.icon) return <span data-rv-glyph className="shrink-0 leading-none select-none"><NodeIcon value={field.icon} size={size} /></span>;
    return <Icon name={fieldTypes.get(field.type)?.icon ?? 'help'} size={size} className="text-muted shrink-0" />;
}
