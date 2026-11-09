/**
 * 속성 목록 — 이름표 | 그 타입의 Cell 한 줄씩. 인스펙터(오른쪽 속성 패널)가 노드마다 칸을 이걸로 그린다.
 *   🔴 칸 그리기를 새로 짜지 않는다 — 표 칸과 같은 Cell(레지스트리)을 그대로 쓴다. 그래서 고르기·날짜·관계·상태가 여기서도 고쳐진다.
 *   onChange 가 없으면 보기 전용 · readOnly 칸(created·updated·id · field.readOnly)은 늘 보기만.
 */
import { Cell } from '../Cell';
import { fieldTypes } from '../fields/registry';
import type { PropertyListProps } from '../contracts/collection';

export function PropertyList({ fields, values, onChange, onOptionsChange }: PropertyListProps) {
    return (
        <div data-rv-props className="flex flex-col gap-1">
            {fields.map((f) => {
                const editable = !!onChange && !f.readOnly && !fieldTypes.get(f.type)?.readOnly;
                return (
                    <div key={f.key} data-rv-prop={f.key} className="flex flex-col">
                        <span className="px-2 text-small text-muted truncate">{f.label}</span>
                        <div className="relative h-row rounded hover:bg-text/[0.04]">
                            <Cell
                                field={f}
                                rowValue={values}
                                editable={editable}
                                onChange={(v) => onChange?.(f.key, v)}
                                onOptionsChange={onOptionsChange ? (o) => onOptionsChange(f.key, o) : undefined}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
