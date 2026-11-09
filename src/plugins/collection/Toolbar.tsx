/**
 * 정리 막대 — 노션처럼 표 위에 선다: 검색 · 필터(그리고·또는, 2단) · 정렬(여러 개) · 칸 숨기기.
 *   🔴 데이터는 안 쥔다 — 보기 상태만 바꾸는 콜백을 받는다. 색·치수는 토큰 클래스로만.
 */
import { useRef, useState } from 'react';
import { DateField, Icon, IconButton, Popover } from '../../pane-ui-system';
import { isRule, opDefsFor, opNeedsValue, opsFor } from './logic';
import { fieldTypes } from './fields/registry';
import type { FilterNode, FilterRule, RecordField, SortRule } from './contracts/collection';

const selCls = 'h-row rounded border border-line bg-bg text-text text-[12px] px-1 min-w-0';

function firstOp(field: RecordField): string {
    return opsFor(field.type)[0] ?? 'empty';
}

/** 한 필터 줄의 값 입력칸 — 칸 타입 정의의 filterInput 에 맞춰 바뀐다(타입 이름을 모른다) */
function ValueEditor({ field, rule, onChange }: { field: RecordField; rule: FilterRule; onChange: (v: string | number) => void }) {
    if (!opNeedsValue(rule.op, field.type)) return null;
    const val = rule.value ?? '';
    const input = fieldTypes.get(field.type)?.filterInput ?? 'text';
    if (input === 'option') {
        return (
            <select className={`${selCls} flex-1`} value={String(val)} onChange={(e) => onChange(e.target.value)}>
                <option value="">(고르기)</option>
                {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        );
    }
    if (input === 'number') {
        return <input type="number" className={`${selCls} flex-1`} value={String(val)} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
    }
    if (input === 'date') {
        return <DateField className={`${selCls} flex-1`} value={String(val)} onChange={(v) => onChange(v)} />;
    }
    return <input type="text" className={`${selCls} flex-1`} value={String(val)} onChange={(e) => onChange(e.target.value)} placeholder="값" />;
}

type Group = { conj: 'and' | 'or'; kids: FilterNode[] };
const asGroup = (n: FilterNode): Group => (isRule(n) ? { conj: 'and', kids: [n] } : 'and' in n ? { conj: 'and', kids: n.and } : { conj: 'or', kids: n.or });
const toNode = (g: Group): FilterNode => (g.conj === 'and' ? { and: g.kids } : { or: g.kids });
const countRules = (n: FilterNode): number => (isRule(n) ? 1 : asGroup(n).kids.reduce((a, k) => a + countRules(k), 0));

/** 필터 한 줄 — 칸 · 연산자 · 값 */
function RuleRow({ fields, rule, onChange, onRemove }: { fields: RecordField[]; rule: FilterRule; onChange: (r: FilterRule) => void; onRemove: () => void }) {
    const f = fields.find((x) => x.key === rule.key) ?? fields[0];
    if (!f) return null;
    return (
        <div className="flex items-center gap-1" data-rv-filter-row>
            <select className={`${selCls} w-[90px]`} value={rule.key}
                onChange={(e) => { const nf = fields.find((x) => x.key === e.target.value)!; onChange({ key: nf.key, op: firstOp(nf) }); }}>
                {fields.map((ff) => <option key={ff.key} value={ff.key}>{ff.label}</option>)}
            </select>
            <select className={`${selCls} w-[86px]`} value={rule.op} onChange={(e) => onChange({ key: rule.key, op: e.target.value })}>
                {opDefsFor(f.type).map((od) => <option key={od.id} value={od.id}>{od.label}</option>)}
            </select>
            <ValueEditor field={f} rule={rule} onChange={(v) => onChange({ ...rule, value: v })} />
            <IconButton icon="x" label="필터 삭제" size={14} onClick={onRemove} />
        </div>
    );
}

/** 규칙 목록 + 「모두/하나라도」 — depth 0(위쪽)만 「그룹 추가」가 뜬다(🔴 3단은 UI 가 막는다) */
function RuleList({ fields, group, depth, onChange, newRule }: {
    fields: RecordField[]; group: Group; depth: number; onChange: (n: FilterNode) => void; newRule: () => FilterRule | null;
}) {
    const set = (kids: FilterNode[], conj = group.conj) => onChange(toNode({ conj, kids }));
    const put = (i: number, n: FilterNode) => set(group.kids.map((k, j) => (j === i ? n : k)));
    const drop = (i: number) => set(group.kids.filter((_, j) => j !== i));
    const addRule = () => { const r = newRule(); if (r) set([...group.kids, r]); };
    const addGroup = () => { const r = newRule(); if (r) set([...group.kids, { and: [r] }]); };
    return (
        <div className={`flex flex-col gap-1.5 ${depth > 0 ? 'p-1.5 rounded border border-line bg-text/[0.02]' : ''}`} data-rv-filter-group={depth}>
            {group.kids.length === 0 && depth === 0 && <span className="text-[12px] text-muted px-1">필터가 없습니다.</span>}
            {group.kids.length > 1 && (
                <select data-rv-filter-conj={depth} className={`${selCls} self-start`} value={group.conj} onChange={(e) => set(group.kids, e.target.value as 'and' | 'or')}>
                    <option value="and">모두 만족(그리고)</option>
                    <option value="or">하나라도 만족(또는)</option>
                </select>
            )}
            {group.kids.map((k, i) => (isRule(k)
                ? <RuleRow key={i} fields={fields} rule={k} onChange={(r) => put(i, r)} onRemove={() => drop(i)} />
                : depth === 0 && (
                    <div key={i} className="flex items-start gap-1">
                        <div className="flex-1 min-w-0">
                            <RuleList fields={fields} group={asGroup(k)} depth={1} newRule={newRule}
                                onChange={(n) => (countRules(n) === 0 ? drop(i) : put(i, n))} />
                        </div>
                        <IconButton icon="x" label="그룹 삭제" size={14} onClick={() => drop(i)} />
                    </div>
                )))}
            <div className="flex items-center gap-1">
                <button type="button" data-rv-add-filter={depth} onClick={addRule} className="flex items-center gap-1 h-row px-1 rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06]">
                    <Icon name="plus" size={13} />필터 추가
                </button>
                {depth === 0 && (
                    <button type="button" data-rv-add-filter-group onClick={addGroup} className="flex items-center gap-1 h-row px-1 rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06]">
                        <Icon name="plus" size={13} />그룹 추가
                    </button>
                )}
            </div>
        </div>
    );
}

export function Toolbar({
    fields,
    search,
    filter,
    sorts,
    hidden,
    onSearch,
    onFilter,
    onSorts,
    onHidden,
}: {
    fields: RecordField[];
    search: string;
    filter: FilterNode;
    sorts: SortRule[];
    hidden: string[];
    onSearch: (q: string) => void;
    onFilter: (f: FilterNode) => void;
    onSorts: (s: SortRule[]) => void;
    onHidden: (h: string[]) => void;
}) {
    const [open, setOpen] = useState<null | 'filter' | 'sort' | 'hide'>(null);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const filterBtn = useRef<HTMLButtonElement>(null);
    const sortBtn = useRef<HTMLButtonElement>(null);
    const hideBtn = useRef<HTMLButtonElement>(null);

    const toggle = (which: 'filter' | 'sort' | 'hide', ref: React.RefObject<HTMLButtonElement | null>) => {
        if (open === which) { setOpen(null); return; }
        if (ref.current) setAnchor(ref.current.getBoundingClientRect());
        setOpen(which);
    };

    // 필터 = 위쪽 묶음(and|or) 하나 — 그 자식은 규칙이거나 규칙만 든 묶음(🔴 2단 · 묶음 속 묶음은 UI 가 안 만든다)
    const top = asGroup(filter);
    const ruleCount = countRules(filter);
    const newRule = (): FilterRule | null => (fields[0] ? { key: fields[0].key, op: firstOp(fields[0]) } : null);
    const addSort = () => {
        const f = fields[0];
        if (!f) return;
        onSorts([...sorts, { key: f.key, dir: 'asc' }]);
    };

    const chip = (active: boolean) =>
        `h-row inline-flex items-center gap-1 px-2 rounded border text-[12px] transition-colors ${active ? 'border-accent text-text bg-text/[0.05]' : 'border-line text-muted hover:text-text'}`;

    return (
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-line shrink-0 flex-wrap">
            {/* 검색 */}
            <div className="flex items-center gap-1 h-row px-2 rounded border border-line bg-bg min-w-[120px]">
                <Icon name="search" size={14} className="text-muted shrink-0" />
                <input
                    data-rv-search
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="검색"
                    className="flex-1 min-w-0 bg-transparent text-[13px] text-text outline-none"
                />
            </div>

            <div className="flex-1" />

            {/* 필터 */}
            <button ref={filterBtn} type="button" data-rv-filter-btn className={chip(ruleCount > 0)} onClick={() => toggle('filter', filterBtn)}>
                <Icon name="filter" size={14} />필터{ruleCount > 0 ? ` ${ruleCount}` : ''}
            </button>
            {/* 정렬 */}
            <button ref={sortBtn} type="button" data-rv-sort-btn className={chip(sorts.length > 0)} onClick={() => toggle('sort', sortBtn)}>
                <Icon name="sort" size={14} />정렬{sorts.length > 0 ? ` ${sorts.length}` : ''}
            </button>
            {/* 칸 숨기기 */}
            <button ref={hideBtn} type="button" data-rv-hide-btn className={chip(hidden.length > 0)} onClick={() => toggle('hide', hideBtn)}>
                <Icon name="eye" size={14} />칸{hidden.length > 0 ? ` ${hidden.length} 숨김` : ''}
            </button>

            {open === 'filter' && anchor && (
                <Popover anchor={anchor} align="right" width={340} onClose={() => setOpen(null)}>
                    <div className="flex flex-col gap-1.5" data-rv-filter-panel>
                        <RuleList fields={fields} group={top} depth={0} onChange={onFilter} newRule={newRule} />
                    </div>
                </Popover>
            )}

            {open === 'sort' && anchor && (
                <Popover anchor={anchor} align="right" width={300} onClose={() => setOpen(null)}>
                    <div className="flex flex-col gap-1.5" data-rv-sort-panel>
                        {sorts.length === 0 && <span className="text-[12px] text-muted px-1">정렬이 없습니다.</span>}
                        {sorts.map((rule, i) => (
                            <div key={i} className="flex items-center gap-1" data-rv-sort-row>
                                <select
                                    className={`${selCls} flex-1`}
                                    value={rule.key}
                                    onChange={(e) => { const next = [...sorts]; next[i] = { ...rule, key: e.target.value }; onSorts(next); }}
                                >
                                    {fields.map((ff) => <option key={ff.key} value={ff.key}>{ff.label}</option>)}
                                </select>
                                <button
                                    type="button"
                                    data-rv-sort-dir
                                    onClick={() => { const next = [...sorts]; next[i] = { ...rule, dir: rule.dir === 'asc' ? 'desc' : 'asc' }; onSorts(next); }}
                                    className="h-row px-2 rounded border border-line text-[12px] text-text hover:bg-text/[0.06]"
                                >{rule.dir === 'asc' ? '오름차순' : '내림차순'}</button>
                                <IconButton icon="x" label="정렬 삭제" size={14} onClick={() => onSorts(sorts.filter((_, j) => j !== i))} />
                            </div>
                        ))}
                        <button type="button" data-rv-add-sort onClick={addSort} className="flex items-center gap-1 h-row px-1 rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06] self-start">
                            <Icon name="plus" size={13} />정렬 추가
                        </button>
                    </div>
                </Popover>
            )}

            {open === 'hide' && anchor && (
                <Popover anchor={anchor} align="right" width={220} onClose={() => setOpen(null)}>
                    <div className="flex flex-col gap-0.5" data-rv-hide-panel>
                        {fields.map((f) => {
                            const shown = !hidden.includes(f.key);
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    data-rv-hide-row={f.key}
                                    onClick={() => onHidden(shown ? [...hidden, f.key] : hidden.filter((k) => k !== f.key))}
                                    className="flex items-center gap-2 h-row px-2 rounded hover:bg-text/[0.06] text-left"
                                >
                                    <Icon name={shown ? 'eye' : 'eyeOff'} size={14} className={shown ? 'text-text' : 'text-muted'} />
                                    <span className={`flex-1 text-[13px] truncate ${shown ? 'text-text' : 'text-muted'}`}>{f.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </Popover>
            )}
        </div>
    );
}
