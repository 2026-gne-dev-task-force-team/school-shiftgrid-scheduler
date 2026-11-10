/**
 * 시간표 툴바 — Frame 툴바 자리(useFrameToolbar)에 꽂는다. 되돌리기·다시하기 · 교시 추가/삭제 ·
 *   선택 행의 시작 시각·길이·앞 쉬는 시간 · 칸 지우기 · 확대/축소.
 *   🔴 시간 쓰기는 전부 model.ts(W10a) 함수 — 겹침 금지 관문은 그쪽이 쥔다. 막히면(같은 값) 알림 한 줄.
 *   🔴 입력칸은 Enter(IME 조합 중 제외)·포커스 이탈에서만 확정 · Esc 취소. 단추는 눌러도 격자의 초점을 안 뺏는다.
 *   좁은 폭에서는 자주 쓰는 것만 남기고 나머지는 「더보기」 팝오버로 접는다.
 *   칸 서식(굵게·배경색)은 시간표 칸(Cell)이 서식을 안 가져서 넣지 않았다.
 */
import { useEffect, useRef, useState } from 'react';
import { IconButton, Button, Popover, TextInput, Toolbar, useNarrow, isMod, keyLabel } from '../../../pane-ui-system';
import {
    addRow, removeRow, rowLength, gapBefore, setRowLength, setGapBefore, setRowTimeChecked,
    type TimetableData,
} from '../model';

/** 확대 단계 — 1분당 px. */
export const ZOOMS = [0.5, 0.8, 1.2] as const;

function fmt(min: number): string {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "9:05" · "09:05" · "0905" · "905" → 분. 못 읽으면 null. */
export function parseHm(s: string): number | null {
    const t = s.trim();
    const m = /^(\d{1,2}):?(\d{2})$/.exec(t) ?? /^(\d{1,2})$/.exec(t);
    if (!m) return null;
    const h = Number(m[1]), mm = m[2] === undefined ? 0 : Number(m[2]);
    if (h > 24 || mm > 59 || (h === 24 && mm > 0)) return null;
    return h * 60 + mm;
}

/** 입력칸 — Enter·포커스 이탈에서 한 번만 넘긴다. */
const HINT = '교시를 먼저 고르세요';
function Field({ label, value, onCommit, width = 'w-16', disabled, resetKey, onGridUndo, hint }: {
    hint?: string;
    resetKey: unknown; onGridUndo?: (which: 'undo' | 'redo') => void;
    label: string; value: string; onCommit: (v: string) => void; width?: string; disabled?: boolean;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const skip = useRef(false);
    // 표가 바뀌면(되돌리기·교시 추가/삭제·선택 행 변경) 초안을 버리고 현재 값으로 다시 채운다.
    useEffect(() => { setDraft(null); }, [resetKey]);
    return (
        <label className="flex shrink-0 items-center gap-1 text-micro text-muted">
            <span>{label}</span>
            <TextInput aria-label={label} disabled={disabled} title={disabled ? hint : undefined} placeholder={disabled ? hint : undefined} value={draft ?? value} inputMode="numeric"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {   // 편집 중이 아니면(초안 = 현재 값) ⌘Z 는 격자 되돌리기로
                    if (!isMod(e.nativeEvent) || e.altKey || e.key.toLowerCase() !== 'z' || e.nativeEvent.isComposing) return;
                    if (draft !== null && draft !== value) return;
                    e.preventDefault(); e.stopPropagation(); onGridUndo?.(e.shiftKey ? 'redo' : 'undo');
                }}
                onBlur={() => { if (!skip.current && draft !== null && draft !== value) onCommit(draft); skip.current = false; setDraft(null); }}
                onEscape={(e) => { skip.current = true; e.currentTarget.blur(); }}
                onEnter={(_, e) => e.currentTarget.blur()}
                className={`${width} text-center text-small tabular-nums`} />
        </label>
    );
}

export interface GridToolbarProps {
    data: TimetableData;
    /** 선택 칸의 행(없으면 null) */
    row: number | null;
    edit: (fn: (d: TimetableData) => TimetableData) => void;
    onNotice?: (msg: string) => void;
    onRemoved?: (title: string) => void;
    onRowRemoved?: () => void;
    onClear: () => void;
    canClear: boolean;
    undo?: () => void; redo?: () => void; canUndo?: boolean; canRedo?: boolean;
    zoom: number; setZoom: (z: number) => void;
}

export function GridToolbar(p: GridToolbarProps) {
    const { data, row, edit, onNotice } = p;
    const narrow = useNarrow();
    const [more, setMore] = useState<DOMRect | null>(null);
    const keep = (e: React.MouseEvent) => e.preventDefault();   // 격자의 초점·선택을 지킨다
    const n = data.rows.length;
    const r = row !== null && row < n ? row : null;
    const zi = ZOOMS.findIndex((z) => z === p.zoom);

    const setStart = (v: string) => {
        const s = parseHm(v);
        if (r === null || s === null) { onNotice?.('시각은 09:30 처럼 적어 주세요'); return; }
        const len = rowLength(data, r);
        const res = setRowTimeChecked(data, r, s, s + len);
        if (res.data !== data) edit(() => res.data);
        if (res.notice) onNotice?.(res.notice);
    };
    const setLen = (v: string) => {
        const m = Number(v.trim());
        if (r === null || !Number.isFinite(m) || m <= 0) { onNotice?.('길이는 분 단위 숫자로 적어 주세요'); return; }
        const next = setRowLength(data, r, m);
        if (next === data) { if (Math.round(m) !== rowLength(data, r)) onNotice?.('하루 끝(24:00)을 넘겨 막았습니다'); return; }
        edit((d) => setRowLength(d, r, m));
    };
    const setGap = (v: string) => {
        const m = Number(v.trim());
        if (r === null || r === 0 || !Number.isFinite(m) || m < 0) { onNotice?.('쉬는 시간은 0 이상 분 단위 숫자로 적어 주세요'); return; }
        const next = setGapBefore(data, r, m);
        if (next === data) { if (Math.round(m) !== gapBefore(data, r)) onNotice?.('하루 끝(24:00)을 넘겨 막았습니다'); return; }
        edit((d) => setGapBefore(d, r, m));
    };

    const gridUndo = (w: 'undo' | 'redo') => { (w === 'undo' ? p.undo : p.redo)?.(); };
    const rk = `${r}|${data.rows.map((x) => `${x.id}:${x.range.start}-${x.range.end}`).join(',')}`;
    const timeFields = (
        <>
            <Field resetKey={rk} onGridUndo={gridUndo} label="시작" value={r === null ? '' : fmt(data.rows[r].range.start)} onCommit={setStart} disabled={r === null} hint={HINT} />
            <Field resetKey={rk} onGridUndo={gridUndo} label="길이(분)" value={r === null ? '' : String(rowLength(data, r))} onCommit={setLen} width="w-12" disabled={r === null} hint={HINT} />
            <Field resetKey={rk} onGridUndo={gridUndo} label="앞 쉬는 시간(분)" value={r === null || r === 0 ? '' : String(gapBefore(data, r))} onCommit={setGap} width="w-12" disabled={r === null || r === 0} hint={r === null ? HINT : '첫 교시는 앞 쉬는 시간이 없습니다'} />
        </>
    );
    const clearBtn = <Button variant="plain" size="sm" title="선택한 칸 지우기" aria-label="칸 지우기" disabled={!p.canClear} onMouseDown={keep} onClick={p.onClear}>지우기</Button>;
    const zoomBtns = (
        <>
            <Button variant="plain" size="sm" title="축소" aria-label="축소" disabled={zi <= 0} onMouseDown={keep} onClick={() => p.setZoom(ZOOMS[zi - 1])}>−</Button>
            <Button variant="plain" size="sm" title="확대" aria-label="확대" disabled={zi < 0 || zi >= ZOOMS.length - 1} onMouseDown={keep} onClick={() => p.setZoom(ZOOMS[zi + 1])}>＋</Button>
        </>
    );

    return (
        <Toolbar label="시간표 도구 줄" scroll={!narrow}
            end={narrow ? <IconButton icon="dots" label="더보기" onMouseDown={keep} onClick={(e) => setMore((e.currentTarget as HTMLElement).getBoundingClientRect())} /> : undefined}>
            <IconButton icon="undo" label="되돌리기" title={`되돌리기 (${keyLabel('Mod+Z')})`} disabled={!p.canUndo} onMouseDown={keep} onClick={p.undo} />
            <IconButton icon="redo" label="다시하기" title={`다시하기 (${keyLabel('Mod+Shift+Z')})`} disabled={!p.canRedo} onMouseDown={keep} onClick={p.redo} />
            <span className="mx-1 h-4 w-px bg-line" />
            <Button variant="plain" size="sm" title="교시 추가(선택 행 아래, 없으면 끝)" aria-label="교시 추가"
                onMouseDown={keep} onClick={() => edit((d) => addRow(d, r === null ? undefined : r + 1))}>교시 추가</Button>
            <IconButton icon="trash" label="교시 삭제" disabled={r === null || n <= 1} onMouseDown={keep}
                onClick={() => { if (r === null) return; edit((d) => removeRow(d, r)); p.onRowRemoved?.(); p.onRemoved?.('교시 1개를 삭제했습니다'); }} />
            {!narrow && (
                <>
                    <span className="mx-1 h-4 w-px bg-line" />
                    {timeFields}
                    <span className="mx-1 h-4 w-px bg-line" />
                    {clearBtn}
                    <span className="mx-1 h-4 w-px bg-line" />
                    {zoomBtns}
                </>
            )}
            {narrow && more && (
                <Popover anchor={more} onClose={() => setMore(null)} width={260} align="right">
                    <div className="flex flex-col gap-2 p-2" role="group" aria-label="더보기">
                        {timeFields}
                        <div className="flex items-center gap-1">{clearBtn}{zoomBtns}</div>
                    </div>
                </Popover>
            )}
        </Toolbar>
    );
}
