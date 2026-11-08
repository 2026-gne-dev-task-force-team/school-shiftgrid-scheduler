/**
 * 정리 막대 — 노션처럼 표 위에 선다: 검색 · 필터(AND 여러 개) · 정렬(여러 개) · 칸 숨기기.
 *   🔴 데이터는 안 쥔다 — 보기 상태만 바꾸는 콜백을 받는다. 색·치수는 토큰 클래스로만.
 */
import { useRef, useState } from 'react';
import { Icon, IconButton } from '../../pane-ui-system';
import { Popover } from './Popover';
import { opNeedsValue, opsFor } from './logic';
import type { FilterOp, FilterRule, RecordField, SortRule } from './contracts/record-view';

const OP_LABEL: Record<FilterOp, string> = {
    contains: '포함', notContains: '미포함', eq: '같음', ne: '다름',
    gt: '초과', gte: '이상', lt: '미만', lte: '이하',
    before: '이전', after: '이후', has: '포함', notHas: '미포함',
    empty: '비어 있음', notEmpty: '안 비어 있음', isTrue: '켜짐', isFalse: '꺼짐',
};

const selCls = 'h-row rounded border border-line bg-bg text-text text-[12px] px-1 min-w-0';

function firstOp(field: RecordField): FilterOp {
    return opsFor(field.type)[0];
}

/** 한 필터 줄의 값 입력칸 — 칸 종류에 맞춰 바뀐다 */
function ValueEditor({ field, rule, onChange }: { field: RecordField; rule: FilterRule; onChange: (v: string | number) => void }) {
    if (!opNeedsValue(rule.op)) return null;
    const val = rule.value ?? '';
    if (field.type === 'select' || field.type === 'multi') {
        return (
            <select className={`${selCls} flex-1`} value={String(val)} onChange={(e) => onChange(e.target.value)}>
                <option value="">(고르기)</option>
                {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        );
    }
    if (field.type === 'number') {
        return <input type="number" className={`${selCls} flex-1`} value={String(val)} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
    }
    if (field.type === 'date') {
        return <input type="date" className={`${selCls} flex-1`} value={String(val)} onChange={(e) => onChange(e.target.value)} />;
    }
    return <input type="text" className={`${selCls} flex-1`} value={String(val)} onChange={(e) => onChange(e.target.value)} placeholder="값" />;
}

export function Toolbar({
    fields,
    search,
    filters,
    sorts,
    hidden,
    onSearch,
    onFilters,
    onSorts,
    onHidden,
}: {
    fields: RecordField[];
    search: string;
    filters: FilterRule[];
    sorts: SortRule[];
    hidden: string[];
    onSearch: (q: string) => void;
    onFilters: (f: FilterRule[]) => void;
    onSorts: (s: SortRule[]) => void;
    onHidden: (h: string[]) => void;
}) {
    const [open, setOpen] = useState<null | 'filter' | 'sort' | 'hide'>(null);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const filterBtn = useRef<HTMLButtonElement>(null);
    const sortBtn = useRef<HTMLButtonElement>(null);
    const hideBtn = useRef<HTMLButtonElement>(null);

    const byKey = new Map(fields.map((f) => [f.key, f]));
    const toggle = (which: 'filter' | 'sort' | 'hide', ref: React.RefObject<HTMLButtonElement | null>) => {
        if (open === which) { setOpen(null); return; }
        if (ref.current) setAnchor(ref.current.getBoundingClientRect());
        setOpen(which);
    };

    const addFilter = () => {
        const f = fields[0];
        if (!f) return;
        onFilters([...filters, { key: f.key, op: firstOp(f) }]);
    };
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
            <button ref={filterBtn} type="button" data-rv-filter-btn className={chip(filters.length > 0)} onClick={() => toggle('filter', filterBtn)}>
                <Icon name="filter" size={14} />필터{filters.length > 0 ? ` ${filters.length}` : ''}
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
                        {filters.length === 0 && <span className="text-[12px] text-muted px-1">필터가 없습니다.</span>}
                        {filters.map((rule, i) => {
                            const f = byKey.get(rule.key) ?? fields[0];
                            return (
                                <div key={i} className="flex items-center gap-1" data-rv-filter-row>
                                    <select
                                        className={`${selCls} w-[90px]`}
                                        value={rule.key}
                                        onChange={(e) => {
                                            const nf = byKey.get(e.target.value)!;
                                            const next = [...filters];
                                            next[i] = { key: nf.key, op: firstOp(nf) };
                                            onFilters(next);
                                        }}
                                    >
                                        {fields.map((ff) => <option key={ff.key} value={ff.key}>{ff.label}</option>)}
                                    </select>
                                    <select
                                        className={`${selCls} w-[86px]`}
                                        value={rule.op}
                                        onChange={(e) => {
                                            const next = [...filters];
                                            next[i] = { ...rule, op: e.target.value as FilterOp, value: undefined };
                                            onFilters(next);
                                        }}
                                    >
                                        {opsFor(f.type).map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
                                    </select>
                                    <ValueEditor
                                        field={f}
                                        rule={rule}
                                        onChange={(v) => { const next = [...filters]; next[i] = { ...rule, value: v }; onFilters(next); }}
                                    />
                                    <IconButton icon="x" label="필터 삭제" size={14} onClick={() => onFilters(filters.filter((_, j) => j !== i))} />
                                </div>
                            );
                        })}
                        <button type="button" data-rv-add-filter onClick={addFilter} className="flex items-center gap-1 h-row px-1 rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06] self-start">
                            <Icon name="plus" size={13} />필터 추가
                        </button>
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
