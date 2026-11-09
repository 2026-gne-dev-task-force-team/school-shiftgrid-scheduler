/**
 * 속성 목록 — 노션 꼴 한 줄씩: 왼쪽 회색 「타입 아이콘 + 이름표」 · 오른쪽 그 타입의 Cell · 줄 hover 배경 · 빈 값은 「비어 있음」.
 *   🔴 칸 그리기를 새로 짜지 않는다 — 표 칸과 같은 Cell(레지스트리)을 그대로 쓴다. 그래서 고르기·날짜·관계·상태가 여기서도 고쳐진다.
 *   onChange 가 없으면 보기 전용 · readOnly 칸(created·updated·id · field.readOnly)은 늘 보기만.
 *   쓰는 곳: 레코드를 옆으로 열었을 때의 페이지(머리 밑) · 속성 패널.
 */
import { Tooltip } from '../../../pane-ui-system';
import { Cell } from '../Cell';
import { FieldGlyph } from '../FieldGlyph';
import { fieldTypes } from '../fields/registry';
import type { PropertyListProps, RecordCellValue } from '../contracts/collection';

const isBlank = (v: RecordCellValue | undefined) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && Number.isNaN(v));

export function PropertyList({ fields, values, onChange, onOptionsChange }: PropertyListProps) {
    return (
        <div data-rv-props className="flex flex-col">
            {fields.map((f) => {
                const def = fieldTypes.get(f.type);
                const editable = !!onChange && !f.readOnly && !def?.readOnly;
                const v = values[f.key];
                const empty = def?.isEmpty ? def.isEmpty(v, f.config) : isBlank(v);
                return (
                    <div key={f.key} data-rv-prop={f.key} className="flex items-start gap-2 rounded hover:bg-text/[0.04]">
                        <div className="shrink-0 w-32 h-row flex items-center gap-1.5 px-1 text-small text-muted">
                            <Tooltip text={f.description} className="flex min-w-0 items-center gap-1.5">
                                <FieldGlyph field={f} />
                                <span className="truncate">{f.label}</span>
                            </Tooltip>
                        </div>
                        {/* 빈 값이면 칸이 제 자리표시 「—」 를 그리는데 「비어 있음」 이 같은 자리에 겹쳐 글자가 깨져 보였다 — 칸의 단독 「—」 는 감춘다(칸 자체는 눌린다) */}
                        <div className={`relative flex-1 min-w-0 h-row ${empty ? '[&_[data-rv-cell]>span:only-child]:invisible' : ''}`}>
                            <Cell
                                field={f}
                                rowValue={values}
                                editable={editable}
                                onChange={(nv) => onChange?.(f.key, nv)}
                                onOptionsChange={onOptionsChange ? (o) => onOptionsChange(f.key, o) : undefined}
                            />
                            {empty && <span data-rv-empty className="absolute inset-y-0 left-2 flex items-center text-small text-muted/60 pointer-events-none select-none">비어 있음</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
