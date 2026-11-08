/**
 * 셀 하나 — 칸 종류별 표시·편집. 제어형이라 고친 값은 onChange 로 바깥에 알리고, 바깥이 값을 되돌려 준다.
 *   text/number : 눌러서 인라인 입력(Enter·바깥클릭 확정 · Esc 취소)
 *   select/multi: 눌러서 고르기 메뉴(색 알약) · multi 는 여러 개
 *   date        : 눌러서 월 그리드(DatePicker)
 *   check       : 눌러서 바로 켜고 끈다
 * 🔴 색·치수는 토큰 클래스 + 알약만(colors.pillStyle). 도메인은 모른다.
 */
import { useEffect, useRef, useState } from 'react';
import { DatePicker } from '../primitives/DatePicker';
import { Icon } from '../primitives/Icon';
import { Popover } from './Popover';
import { pillStyle } from './colors';
import { rawValue } from './logic';
import type { FieldOption, RecordCellValue, RecordField } from './types';

/** 색 알약 한 개 */
function Pill({ option }: { option: FieldOption }) {
    return (
        <span
            className="inline-flex items-center px-1.5 h-[18px] rounded-[3px] text-[12px] leading-none max-w-full truncate"
            style={pillStyle(option.color)}
        >
            {option.label}
        </span>
    );
}

function optOf(field: RecordField, value: string): FieldOption {
    return field.options?.find((o) => o.value === value) ?? { value, label: value };
}

export function Cell({
    field,
    rowValue,
    editable,
    onChange,
}: {
    field: RecordField;
    /** 행 하나(셀은 [field.key] 로 읽는다) */
    rowValue: unknown;
    editable: boolean;
    onChange: (v: RecordCellValue) => void;
}) {
    const v = rawValue(rowValue, field.key);
    const [editing, setEditing] = useState(false);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);

    const openPopover = (e: React.MouseEvent) => {
        if (!editable) return;
        setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
    };

    // ── check ───────────────────────────────────────────────────────────────
    if (field.type === 'check') {
        const on = !!v;
        return (
            <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!editable}
                data-rv-cell={field.key}
                onClick={() => editable && onChange(!on)}
                className={`grid place-items-center w-full h-full ${editable ? 'cursor-pointer' : 'cursor-default'}`}
            >
                <span className={`grid place-items-center w-4 h-4 rounded-[3px] border ${on ? 'bg-accent border-accent text-bg' : 'border-line'}`}>
                    {on && <Icon name="check" size={12} />}
                </span>
            </button>
        );
    }

    // ── text / number — 인라인 입력 ──────────────────────────────────────────
    if (field.type === 'text' || field.type === 'number') {
        if (editing && editable) {
            return (
                <InlineInput
                    initial={v === null || v === undefined ? '' : String(v)}
                    numeric={field.type === 'number'}
                    dataKey={field.key}
                    onCommit={(text) => {
                        setEditing(false);
                        if (field.type === 'number') {
                            const t = text.trim();
                            onChange(t === '' ? null : Number(t));
                        } else {
                            onChange(text);
                        }
                    }}
                    onCancel={() => setEditing(false)}
                />
            );
        }
        const text = v === null || v === undefined ? '' : String(v);
        return (
            <div
                data-rv-cell={field.key}
                onClick={() => editable && setEditing(true)}
                className={`w-full h-full flex items-center px-2 text-[13px] truncate ${field.type === 'number' ? 'justify-end tabular-nums' : ''} ${editable ? 'cursor-text' : 'cursor-default'} ${text === '' ? 'text-muted' : 'text-text'}`}
            >
                {text}
            </div>
        );
    }

    // ── select — 한 개 ───────────────────────────────────────────────────────
    if (field.type === 'select') {
        const cur = v === null || v === undefined || v === '' ? null : String(v);
        return (
            <>
                <div
                    data-rv-cell={field.key}
                    onClick={openPopover}
                    className={`w-full h-full flex items-center gap-1 px-2 truncate ${editable ? 'cursor-pointer' : 'cursor-default'}`}
                >
                    {cur !== null ? <Pill option={optOf(field, cur)} /> : <span className="text-[12px] text-muted">—</span>}
                </div>
                {anchor && (
                    <Popover anchor={anchor} width={220} onClose={() => setAnchor(null)}>
                        <div className="flex flex-col gap-0.5 max-h-[280px] overflow-auto" data-rv-options={field.key}>
                            <button
                                type="button"
                                onClick={() => { onChange(null); setAnchor(null); }}
                                className="flex items-center h-row px-2 rounded text-[12px] text-muted hover:bg-text/[0.06] text-left"
                            >비우기</button>
                            {(field.options ?? []).map((o) => (
                                <button
                                    key={o.value}
                                    type="button"
                                    data-rv-opt={o.value}
                                    onClick={() => { onChange(o.value); setAnchor(null); }}
                                    className={`flex items-center h-row px-2 rounded hover:bg-text/[0.06] text-left ${cur === o.value ? 'bg-text/[0.04]' : ''}`}
                                >
                                    <Pill option={o} />
                                </button>
                            ))}
                        </div>
                    </Popover>
                )}
            </>
        );
    }

    // ── multi — 여러 개 ──────────────────────────────────────────────────────
    if (field.type === 'multi') {
        const arr = Array.isArray(v) ? v.map(String) : [];
        const toggle = (val: string) => {
            const next = arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
            onChange(next);
        };
        return (
            <>
                <div
                    data-rv-cell={field.key}
                    onClick={openPopover}
                    className={`w-full h-full flex items-center gap-1 px-2 overflow-hidden ${editable ? 'cursor-pointer' : 'cursor-default'}`}
                >
                    {arr.length > 0
                        ? arr.map((val) => <Pill key={val} option={optOf(field, val)} />)
                        : <span className="text-[12px] text-muted">—</span>}
                </div>
                {anchor && (
                    <Popover anchor={anchor} width={220} onClose={() => setAnchor(null)}>
                        <div className="flex flex-col gap-0.5 max-h-[280px] overflow-auto" data-rv-options={field.key}>
                            {(field.options ?? []).map((o) => {
                                const picked = arr.includes(o.value);
                                return (
                                    <button
                                        key={o.value}
                                        type="button"
                                        data-rv-opt={o.value}
                                        aria-pressed={picked}
                                        onClick={() => toggle(o.value)}
                                        className={`flex items-center gap-2 h-row px-2 rounded hover:bg-text/[0.06] text-left ${picked ? 'bg-text/[0.04]' : ''}`}
                                    >
                                        <span className={`grid place-items-center w-4 h-4 rounded-[3px] border shrink-0 ${picked ? 'bg-accent border-accent text-bg' : 'border-line'}`}>
                                            {picked && <Icon name="check" size={12} />}
                                        </span>
                                        <Pill option={o} />
                                    </button>
                                );
                            })}
                        </div>
                    </Popover>
                )}
            </>
        );
    }

    // ── date ─────────────────────────────────────────────────────────────────
    const iso = typeof v === 'string' && v !== '' ? v : null;
    return (
        <>
            <div
                data-rv-cell={field.key}
                onClick={openPopover}
                className={`w-full h-full flex items-center px-2 text-[13px] truncate ${editable ? 'cursor-pointer' : 'cursor-default'} ${iso ? 'text-text' : 'text-muted'}`}
            >
                {iso ?? '—'}
            </div>
            {anchor && (
                <Popover anchor={anchor} width={240} onClose={() => setAnchor(null)}>
                    <DatePicker value={iso} onChange={(d) => { onChange(d); setAnchor(null); }} />
                    {iso && (
                        <button
                            type="button"
                            onClick={() => { onChange(null); setAnchor(null); }}
                            className="mt-1 w-full h-row rounded text-[12px] text-muted hover:bg-text/[0.06]"
                        >비우기</button>
                    )}
                </Popover>
            )}
        </>
    );
}

/** 인라인 입력칸 — 뜨자마자 포커스·전체선택. Enter/바깥클릭 확정 · Esc 취소. */
function InlineInput({
    initial,
    numeric,
    dataKey,
    onCommit,
    onCancel,
}: {
    initial: string;
    numeric: boolean;
    dataKey: string;
    onCommit: (text: string) => void;
    onCancel: () => void;
}) {
    const [text, setText] = useState(initial);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);
    return (
        <input
            ref={ref}
            data-rv-cell={dataKey}
            data-rv-editing="1"
            inputMode={numeric ? 'decimal' : 'text'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => onCommit(text)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); onCommit(text); }
                else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            }}
            className={`w-full h-full px-2 bg-bg text-text text-[13px] outline-none border border-accent rounded-none ${numeric ? 'text-right tabular-nums' : ''}`}
        />
    );
}
