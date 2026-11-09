/**
 * 내장 칸 타입의 셀 — 표시+편집. 제어형이라 고친 값은 onChange 로 알리고, 바깥이 값을 되돌려 준다.
 *   text/number : 눌러서 인라인 입력(Enter·바깥클릭 확정 · Esc 취소 · 🔴 IME 조합 중 Enter 는 무시)
 *   select/multi: 눌러서 고르기 메뉴(색 알약) · 선택지를 그 자리에서 추가·이름·색·순서·삭제(onOptionsChange 가 있을 때)
 *   date        : 눌러서 월 그리드(DatePicker)
 *   check       : 눌러서 바로 켜고 끈다
 * 🔴 색·치수는 토큰 클래스 + 알약만(colors.pillStyle). 도메인은 모른다.
 */
import { useEffect, useRef, useState } from 'react';
import { DatePicker, Icon, Popover, Pill, PILL_COLORS, MenuItem, MenuList, isImeEnter, pillStyle, useReorder } from '../../../pane-ui-system';
import { ReorderOverlay } from '../ReorderOverlay';
import { formatNumber } from './format';
import { dateText, toDateValue, type DateConfig } from './dates';
import { hrefOf, isValidLink, type LinkKind } from './links';
import type { DateValue, FieldCellProps, FieldOption, RecordField } from '../contracts/collection';

/** 색 알약 한 개 */
function OptionPill({ option }: { option: FieldOption }) {
    return (
        <Pill color={option.color}>{option.label}</Pill>
    );
}

function optOf(field: RecordField, value: string): FieldOption {
    return field.options?.find((o) => o.value === value) ?? { value, label: value };
}

/** 인라인 입력칸 — 뜨자마자 포커스·전체선택. Enter/Tab/바깥클릭 확정 · Esc 취소. 🔴 IME 조합 중 Enter 는 확정이 아니다.
 *  multiline(글 칸)이면 textarea — Shift+Enter 가 칸 안 줄바꿈(값에 \n). 그 밖엔 Shift+Enter = Enter. */
function InlineInput({ initial, numeric, multiline, dataKey, onCommit, onCancel }: {
    initial: string; numeric: boolean; multiline?: boolean; dataKey: string;
    onCommit: (text: string) => void; onCancel: () => void;
}) {
    const [text, setText] = useState(initial);
    const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
    const done = useRef(false);
    useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
    const commit = () => { if (done.current) return; done.current = true; onCommit(text); };
    const common = {
        'data-rv-cell': dataKey,
        'data-rv-editing': '1',
        inputMode: numeric ? 'decimal' as const : 'text' as const,
        onBlur: commit,
        onKeyDown: (e: React.KeyboardEvent) => {
            if (isImeEnter(e)) return;
            if (e.key === 'Enter') { if (multiline && e.shiftKey) return; e.preventDefault(); commit(); }
            else if (e.key === 'Tab') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); done.current = true; onCancel(); }
        },
    };
    const cls = `w-full h-full px-2 bg-bg text-text text-[13px] outline-none border border-accent rounded-none ${numeric ? 'text-right tabular-nums' : ''}`;
    if (multiline) {
        return (
            <textarea ref={ref} {...common} rows={1} value={text} onChange={(e) => setText(e.target.value)}
                className={`${cls} py-1.5 leading-snug resize-none overflow-hidden`} />
        );
    }
    return <input ref={ref} {...common} value={text} onChange={(e) => setText(e.target.value)} className={cls} />;
}

export function CheckCell({ field, value, editable, onChange }: FieldCellProps) {
    const on = !!value;
    return (
        <button
            type="button" role="checkbox" aria-checked={on} disabled={!editable}
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

function makeInlineCell(numeric: boolean) {
    return function InlineCell({ field, value, editable, onChange }: FieldCellProps) {
        const [editing, setEditing] = useState(false);
        if (editing && editable) {
            return (
                <InlineInput
                    initial={value === null || value === undefined ? '' : String(value)}
                    numeric={numeric}
                    multiline={!numeric}
                    dataKey={field.key}
                    onCommit={(text) => {
                        setEditing(false);
                        if (numeric) { const t = text.trim(); onChange(t === '' ? null : Number(t)); } else onChange(text);
                    }}
                    onCancel={() => setEditing(false)}
                />
            );
        }
        const text = numeric
            ? formatNumber(value, field.config)
            : value === null || value === undefined ? '' : String(value);
        return (
            <div
                data-rv-cell={field.key}
                onClick={() => editable && setEditing(true)}
                className={`w-full h-full flex items-center px-2 text-[13px] truncate ${numeric ? 'justify-end tabular-nums' : ''} ${editable ? 'cursor-text' : 'cursor-default'} ${text === '' ? 'text-muted' : 'text-text'}`}
            >
                {text}
            </div>
        );
    };
}
export const TextCell = makeInlineCell(false);
export const NumberCell = makeInlineCell(true);

/** 새 선택지 값 — 글자와 같게(변환·붙여넣기가 글자로 찾는다). 겹치면 뒤에 숫자. */
function uniqueValue(options: readonly FieldOption[], label: string): string {
    const taken = new Set(options.map((o) => o.value));
    if (!taken.has(label)) return label;
    let n = 2;
    while (taken.has(`${label}${n}`)) n++;
    return `${label}${n}`;
}

/** 선택지 편집 줄 — 이름 입력 · 색 고르기 · 삭제. 끌어서 순서는 목록(OptionList)이 쥔다. */
function OptionEditRow({ option, onChange, onDelete }: { option: FieldOption; onChange: (o: FieldOption) => void; onDelete: () => void }) {
    const [label, setLabel] = useState(option.label);
    return (
        <div className="flex flex-col gap-1 px-1 py-1 rounded bg-text/[0.04]" data-rv-opt-editor={option.value}>
            <input
                data-rv-opt-label
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => { const t = label.trim(); if (t && t !== option.label) onChange({ ...option, label: t }); }}
                onKeyDown={(e) => {
                    if (isImeEnter(e)) return;
                    if (e.key === 'Enter') { e.preventDefault(); const t = label.trim(); if (t && t !== option.label) onChange({ ...option, label: t }); }
                }}
                className="h-row px-2 rounded border border-line bg-bg text-[13px] text-text outline-none"
            />
            <div className="flex flex-wrap gap-1">
                {PILL_COLORS.map((c) => (
                    <button
                        key={c} type="button" data-rv-opt-color={c} aria-label={c} aria-pressed={(option.color ?? 'gray') === c}
                        onClick={() => onChange({ ...option, color: c })}
                        className={`w-4 h-4 rounded-full border ${(option.color ?? 'gray') === c ? 'border-text' : 'border-line'}`}
                        style={{ backgroundColor: pillStyle(c).color }}
                    />
                ))}
            </div>
            <button type="button" data-rv-opt-delete onClick={onDelete} className="flex items-center gap-1.5 h-row px-1 rounded text-[12px] text-bad hover:bg-bad/10 self-start">
                <Icon name="trash" size={12} />선택지 삭제
            </button>
        </div>
    );
}

/** 선택지 목록 + 새 선택지 입력 — select·multi 팝오버의 몸통. 선택지 편집은 onOptionsChange 가 있을 때만 켜진다. */
function OptionList({ field, picked, multi, onPick, onOptionsChange }: {
    field: RecordField;
    picked: string[];
    multi: boolean;
    onPick: (value: string) => void;
    onOptionsChange?: (o: FieldOption[]) => void;
}) {
    const options = field.options ?? [];
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const addDraft = () => {
        const t = draft.trim();
        if (!t || !onOptionsChange) return;
        const color = PILL_COLORS[(options.length + 1) % PILL_COLORS.length];
        onOptionsChange([...options, { value: uniqueValue(options, t), label: t, color }]);
        setDraft('');
    };
    // 🔴 순서는 공용 훅 하나(보기 탭·칸 머리와 같은 것) — 손잡이(⋮⋮)를 끌거나 Alt+↑/↓
    const reorder = useReorder<HTMLDivElement>({
        ids: options.map((o) => o.value),
        axis: 'y',
        enabled: !!onOptionsChange,
        onReorder: (ids) => onOptionsChange?.(ids.map((id) => options.find((o) => o.value === id)!)),
    });
    return (
        <div ref={reorder.containerRef} {...reorder.bind} onKeyDown={reorder.onKeyDown}
            onPointerDownCapture={() => { reorder.draggedRef.current = false; }}
            className="flex flex-col gap-0.5 max-h-[320px] overflow-auto" data-rv-options={field.key}>
            {options.map((o) => {
                const on = picked.includes(o.value);
                return (
                    <div key={o.value} className="flex flex-col">
                        <div
                            className={`flex items-center gap-1 rounded hover:bg-text/[0.06] ${on ? 'bg-text/[0.04]' : ''}`}
                            data-rv-opt-row={o.value} data-row-id={o.value} title={o.label}
                        >
                            {onOptionsChange && <span data-rv-opt-grip={o.value} tabIndex={0} aria-label="순서 바꾸기(Alt+↑↓)" className="grid place-items-center shrink-0 cursor-grab outline-none text-muted"><Icon name="grip" size={12} /></span>}
                            <button
                                type="button" data-rv-opt={o.value} aria-pressed={on}
                                onClick={() => { if (reorder.draggedRef.current) { reorder.draggedRef.current = false; return; } onPick(o.value); }}
                                className="flex-1 min-w-0 flex items-center gap-2 h-row px-1 text-left"
                            >
                                {multi && (
                                    <span className={`grid place-items-center w-4 h-4 rounded-[3px] border shrink-0 ${on ? 'bg-accent border-accent text-bg' : 'border-line'}`}>
                                        {on && <Icon name="check" size={12} />}
                                    </span>
                                )}
                                <OptionPill option={o} />
                            </button>
                            {onOptionsChange && (
                                <button type="button" data-rv-opt-edit={o.value} aria-label="선택지 편집"
                                    onClick={() => setEditing(editing === o.value ? null : o.value)}
                                    className="shrink-0 grid place-items-center w-5 h-5 rounded text-muted hover:text-text hover:bg-text/[0.08]">
                                    <Icon name="dots" size={14} />
                                </button>
                            )}
                        </div>
                        {onOptionsChange && editing === o.value && (
                            <OptionEditRow
                                option={o}
                                onChange={(next) => onOptionsChange(options.map((x) => (x.value === o.value ? next : x)))}
                                onDelete={() => { setEditing(null); onOptionsChange(options.filter((x) => x.value !== o.value)); }}
                            />
                        )}
                    </div>
                );
            })}
            {options.length === 0 && (
                <div data-rv-opt-empty className="px-2 py-1 text-note text-muted">
                    {onOptionsChange ? '선택지가 없어요. 아래에 입력하고 Enter 를 누르면 만들어져요.' : '선택지가 없어요. 속성 편집에서 추가할 수 있어요.'}
                </div>
            )}
            {onOptionsChange && (
                <input
                    data-rv-new-opt
                    autoFocus={options.length === 0}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (isImeEnter(e)) return; if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }}
                    placeholder="+ 새 선택지"
                    className="mt-1 h-row px-2 rounded border border-line bg-bg text-[13px] text-text outline-none"
                />
            )}
            <ReorderOverlay drag={reorder.drag} indicator={reorder.indicator} axis="y" />
        </div>
    );
}

export function SelectCell({ field, value, editable, onChange, onOptionsChange }: FieldCellProps) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const cur = value === null || value === undefined || value === '' ? null : String(value);
    return (
        <>
            <div
                data-rv-cell={field.key}
                onClick={(e) => editable && setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())}
                className={`w-full h-full flex items-center gap-1 px-2 truncate ${editable ? 'cursor-pointer' : 'cursor-default'}`}
            >
                {cur !== null ? <OptionPill option={optOf(field, cur)} /> : <span className="text-[12px] text-muted">—</span>}
            </div>
            {anchor && (
                <Popover anchor={anchor} width={240} onClose={() => setAnchor(null)}>
                    <MenuList label="셀 비우기"><MenuItem label="비우기" icon="x" onSelect={() => { onChange(null); setAnchor(null); }} /></MenuList>
                    <OptionList
                        field={field} picked={cur === null ? [] : [cur]} multi={false}
                        onPick={(v) => { onChange(v); setAnchor(null); }}
                        onOptionsChange={onOptionsChange}
                    />
                </Popover>
            )}
        </>
    );
}

export function MultiCell({ field, value, editable, onChange, onOptionsChange }: FieldCellProps) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const arr = Array.isArray(value) ? value.map(String) : [];
    return (
        <>
            <div
                data-rv-cell={field.key}
                onClick={(e) => editable && setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())}
                className={`w-full h-full flex items-center gap-1 px-2 overflow-hidden ${editable ? 'cursor-pointer' : 'cursor-default'}`}
            >
                {arr.length > 0 ? arr.map((v) => <OptionPill key={v} option={optOf(field, v)} />) : <span className="text-[12px] text-muted">—</span>}
            </div>
            {anchor && (
                <Popover anchor={anchor} width={240} onClose={() => setAnchor(null)}>
                    <OptionList
                        field={field} picked={arr} multi
                        onPick={(v) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])}
                        onOptionsChange={onOptionsChange}
                    />
                </Popover>
            )}
        </>
    );
}

export function DateCell({ field, value, editable, onChange }: FieldCellProps) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const cfg = (field.config && typeof field.config === 'object' ? field.config : {}) as DateConfig;
    const dv = toDateValue(value);
    const label = dateText(value);
    // 시작을 고치면 끝은(있으면·range 면) 지킨다. range 가 아니면 하나 고르고 닫는다.
    const setStart = (s: string) => {
        const next: DateValue = { start: s };
        if (cfg.range && dv?.end) next.end = dv.end;
        onChange(next);
        if (!cfg.range) setAnchor(null);
    };
    const setEnd = (e: string) => onChange({ start: dv?.start ?? e, end: e });
    return (
        <>
            <div
                data-rv-cell={field.key}
                onClick={(ev) => editable && setAnchor((ev.currentTarget as HTMLElement).getBoundingClientRect())}
                className={`w-full h-full flex items-center px-2 text-[13px] truncate ${editable ? 'cursor-pointer' : 'cursor-default'} ${label ? 'text-text' : 'text-muted'}`}
            >
                {label || '—'}
            </div>
            {anchor && (
                <Popover anchor={anchor} width={260} onClose={() => setAnchor(null)}>
                    <div data-rv-date-start>
                        {cfg.range && <div className="px-1 pb-0.5 text-[11px] text-muted">시작</div>}
                        <DatePicker value={dv?.start ?? null} time={cfg.time} onChange={setStart} />
                    </div>
                    {cfg.range && (
                        <div data-rv-date-end className="mt-2 pt-2 border-t border-line">
                            <div className="px-1 pb-0.5 text-[11px] text-muted">종료</div>
                            <DatePicker value={dv?.end ?? null} time={cfg.time} onChange={setEnd} />
                        </div>
                    )}
                    {dv && (
                        <div className="mt-1"><MenuList label="셀 비우기"><MenuItem label="비우기" icon="x" onSelect={() => { onChange(null); setAnchor(null); }} /></MenuList></div>
                    )}
                </Popover>
            )}
        </>
    );
}

/** url·email·phone — 글자 셀처럼 눌러 고치되, 형식이 맞으면 열기 단추, 틀리면 ⚠. */
function makeLinkCell(kind: LinkKind) {
    return function LinkCell({ field, value, editable, onChange }: FieldCellProps) {
        const [editing, setEditing] = useState(false);
        const s = value === null || value === undefined ? '' : String(value);
        if (editing && editable) {
            return (
                <InlineInput
                    initial={s} numeric={false} dataKey={field.key}
                    onCommit={(t) => { setEditing(false); onChange(t); }}
                    onCancel={() => setEditing(false)}
                />
            );
        }
        const valid = isValidLink(kind, s);
        return (
            <div
                data-rv-cell={field.key}
                onClick={() => editable && setEditing(true)}
                className={`w-full h-full flex items-center gap-1 px-2 text-[13px] ${editable ? 'cursor-text' : 'cursor-default'} ${s === '' ? 'text-muted' : 'text-text'}`}
            >
                <span className="flex-1 min-w-0 truncate">{s || '—'}</span>
                {s !== '' && !valid && (
                    <span data-rv-invalid={field.key} title="형식이 올바르지 않습니다" className="shrink-0 grid place-items-center text-bad">
                        <Icon name="warn" size={13} />
                    </span>
                )}
                {valid && (
                    <a href={hrefOf(kind, s)} target="_blank" rel="noreferrer noopener"
                        data-rv-link={field.key} aria-label="열기" onClick={(e) => e.stopPropagation()}
                        className="shrink-0 grid place-items-center w-5 h-5 rounded text-muted hover:text-accent hover:bg-text/[0.08]">
                        <Icon name="arrowRight" size={13} />
                    </a>
                )}
            </div>
        );
    };
}
export const UrlCell = makeLinkCell('url');
export const EmailCell = makeLinkCell('email');
export const PhoneCell = makeLinkCell('phone');

/** 자동 계산 칸(created·updated·id) — 읽기 전용. 보이는 글자는 타입이 toText 로 정한다. */
export function ReadonlyCell({ field, value, config }: FieldCellProps) {
    const t = field.type === 'id'
        ? (typeof value === 'number' ? `${(config as { prefix?: string })?.prefix ?? ''}${value}` : '')
        : (typeof value === 'string' ? value.replace('T', ' ') : '');
    return (
        <div data-rv-cell={field.key} className={`w-full h-full flex items-center px-2 text-[13px] truncate ${t ? 'text-muted' : 'text-muted/60'}`}>
            {t || '—'}
        </div>
    );
}
