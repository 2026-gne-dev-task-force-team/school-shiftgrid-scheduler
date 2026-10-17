/**
 * 범용 격자 — 행·열이 무엇인지 모른다(요일·교시를 안 박는다). cols·rows 를 받아 그린다.
 * 칸을 클릭해 글자를 쓴다. 키보드: 화살표로 이동 · Enter 로 편집/아래 · Tab 으로 오른쪽 · Esc 취소.
 * 🔴 글자는 글자일 뿐 — 여기서 「개념 승격」을 하지 않는다. onCommit 은 순수 글자만 올린다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxisHead } from '../axes';

interface GridProps {
    cols: AxisHead[];
    rows: AxisHead[];
    getText: (colKey: string, rowKey: string) => string;
    onCommit: (colKey: string, rowKey: string, text: string) => void;
    /** 열 머리 왼쪽 위 모서리에 쓸 라벨 */
    corner?: string;
}

export function Grid({ cols, rows, getText, onCommit, corner = '' }: GridProps) {
    const [focus, setFocus] = useState<{ c: number; r: number } | null>(null);
    const [editing, setEditing] = useState<{ c: number; r: number } | null>(null);
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

    const startEdit = useCallback((c: number, r: number, seed?: string) => {
        if (!rows[r]?.assignable) return;
        setFocus({ c, r });
        setEditing({ c, r });
        setDraft(seed ?? getText(cols[c].key, rows[r].key));
    }, [cols, rows, getText]);

    const commitDraft = useCallback(() => {
        if (!editing) return;
        onCommit(cols[editing.c].key, rows[editing.r].key, draft);
        setEditing(null);
    }, [editing, draft, cols, rows, onCommit]);

    const cancelEdit = useCallback(() => setEditing(null), []);

    const move = useCallback((dc: number, dr: number) => {
        setFocus((f) => {
            const base = f ?? { c: 0, r: firstAssignableRow(rows) };
            const c = clamp(base.c + dc, 0, cols.length - 1);
            const r = clamp(base.r + dr, 0, rows.length - 1);
            return { c, r };
        });
    }, [cols.length, rows]);

    // 편집이 아닐 때의 키보드 이동 — 격자 컨테이너에서 받는다
    const onGridKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (editing) return; // 편집 중엔 input 이 키를 받는다
        if (!focus) return;
        if (e.key === 'ArrowUp') { e.preventDefault(); move(0, -1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); move(0, 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1, 0); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); move(1, 0); }
        else if (e.key === 'Tab') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0); }
        else if (e.key === 'Enter') { e.preventDefault(); startEdit(focus.c, focus.r); }
        else if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            if (rows[focus.r]?.assignable) onCommit(cols[focus.c].key, rows[focus.r].key, '');
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // 글자를 바로 치면 편집 시작(그 글자로 갈아끼운다)
            startEdit(focus.c, focus.r, e.key);
        }
    }, [editing, focus, move, startEdit, rows, cols, onCommit]);

    const onInputKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); commitDraft(); move(0, 1); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
        else if (e.key === 'Tab') { e.preventDefault(); commitDraft(); move(e.shiftKey ? -1 : 1, 0); }
    }, [commitDraft, cancelEdit, move]);

    return (
        <div
            className="inline-block focus:outline-none select-none"
            tabIndex={0}
            onKeyDown={onGridKeyDown}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { /* 유지 */ } }}
        >
            <table className="border-collapse text-[12px]">
                <thead>
                    <tr>
                        <th className="sticky left-0 z-10 bg-panel2 border border-line px-2 py-1 text-muted font-medium min-w-[48px]">{corner}</th>
                        {cols.map((col) => (
                            <th key={col.key} className="bg-panel2 border border-line px-3 py-1 text-text font-semibold min-w-[72px]">{col.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, ri) => (
                        <tr key={row.key}>
                            <th className={`sticky left-0 z-10 border border-line px-2 py-1 font-medium text-right ${row.assignable ? 'bg-panel2 text-text' : 'bg-panel2/60 text-muted'}`}>
                                {row.label}
                            </th>
                            {cols.map((col, ci) => {
                                const isEditing = editing?.c === ci && editing?.r === ri;
                                const isFocus = focus?.c === ci && focus?.r === ri;
                                const text = getText(col.key, row.key);
                                if (!row.assignable) {
                                    return <td key={col.key} className="border border-line bg-panel2/40 text-muted/60 text-center px-2 py-1">·</td>;
                                }
                                return (
                                    <td key={col.key} className="border border-line p-0 align-top">
                                        {isEditing ? (
                                            <input
                                                ref={inputRef}
                                                value={draft}
                                                onChange={(e) => setDraft(e.target.value)}
                                                onKeyDown={onInputKeyDown}
                                                onBlur={commitDraft}
                                                className="w-full min-w-[72px] h-[38px] px-2 bg-panel text-text outline outline-2 outline-accent text-[12px]"
                                            />
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setFocus({ c: ci, r: ri })}
                                                onDoubleClick={() => startEdit(ci, ri)}
                                                className={`w-full min-w-[72px] h-[38px] px-2 text-left align-top whitespace-pre-wrap break-words leading-tight
                                                    ${isFocus ? 'outline outline-2 -outline-offset-2 outline-accent bg-accent/5' : 'hover:bg-panel2/50'}`}
                                            >
                                                {text}
                                            </button>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }
function firstAssignableRow(rows: AxisHead[]): number {
    const i = rows.findIndex((r) => r.assignable);
    return i < 0 ? 0 : i;
}
