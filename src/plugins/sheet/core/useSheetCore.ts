/**
 * useSheetCore — 범용 표 엔진(옛 도메인 부품에서 흡수 · 이름은 전부 범용으로).
 *  칸/범위 선택 · 키보드 이동 · 편집 시작/확정/취소 · 복사·붙여넣기 · 채우기 · 지우기.
 *  🔴 좌표는 늘 '뷰' 좌표(화면에 보이는 행·열)다. 뷰↔데이터 변환은 Table 의 adapter 가 한다.
 *  편집 확정 한 번 = adapter.commit 한 번 = undo 한 단위. commit 은 동작 종류(source)를 함께 받는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { CellChange, CellPos, SheetCoreAdapter, SheetCoreHandle } from './types';
import { undoKey, isImeEnter, parseClipboard, toTsv } from '../../../pane-ui-system';

// 마지막 복사한 TSV — navigator.clipboard 가 막힌 자리(file:// 등)의 내부 대비책.
let lastCopiedTsv = '';

export interface SheetCore {
    active: CellPos;
    anchor: CellPos;
    sel: { r1: number; r2: number; c1: number; c2: number };
    edit: { r: number; c: number; text: string } | null;
    fillTo: number | null;
    fillActiveRef: React.RefObject<boolean>;
    containerRef: React.RefObject<HTMLDivElement | null>;
    inSel: (r: number, c: number) => boolean;
    setEditText: (t: string) => void;
    beginEdit: (r: number, c: number, typed?: string) => void;
    commitEdit: (moveR: number, moveC: number, pickText?: string) => void;
    cancelEdit: () => void;
    moveTo: (r: number, c: number, extend?: boolean) => void;
    setActive: (p: CellPos) => void;
    setAnchor: (p: CellPos) => void;
    focusGrid: () => void;
    markFocused: (v: boolean) => void;
    onFocus: () => void;
    onBlur: (e: React.FocusEvent) => void;
    beginDrag: (r: number, c: number, e: { button: number; shiftKey: boolean }) => void;
    onCellEnter: (r: number, c: number) => void;
    startFill: () => void;
    beginExtend: () => void;
    handle: SheetCoreHandle;
}

export function useSheetCore(adapter: SheetCoreAdapter): SheetCore {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [active, setActiveState] = useState<CellPos>({ r: 0, c: 0 });
    const [anchor, setAnchorState] = useState<CellPos>({ r: 0, c: 0 });
    const [edit, setEdit] = useState<{ r: number; c: number; text: string } | null>(null);
    const [fillTo, setFillTo] = useState<number | null>(null);
    const dragRef = useRef(false);
    const fillRef = useRef(false);
    const focusedRef = useRef(false);

    // 최신 값을 refs 로 들고 있어 document 리스너·handle 이 stale 클로저를 안 탄다.
    const adapterRef = useRef(adapter);
    adapterRef.current = adapter;
    const activeRef = useRef(active);
    activeRef.current = active;
    const anchorRef = useRef(anchor);
    anchorRef.current = anchor;
    const editRef = useRef(edit);
    editRef.current = edit;

    const setActive = useCallback((p: CellPos) => setActiveState(p), []);
    const setAnchor = useCallback((p: CellPos) => setAnchorState(p), []);

    const sel = useMemo(
        () => ({
            r1: Math.min(active.r, anchor.r),
            r2: Math.max(active.r, anchor.r),
            c1: Math.min(active.c, anchor.c),
            c2: Math.max(active.c, anchor.c),
        }),
        [active, anchor],
    );
    const selRef = useRef(sel);
    selRef.current = sel;

    const inSel = useCallback(
        (r: number, c: number) => r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2,
        [sel],
    );

    const clamp = useCallback((r: number, c: number): CellPos => {
        const a = adapterRef.current;
        return {
            r: Math.max(0, Math.min(a.rowCount - 1, r)),
            c: Math.max(0, Math.min(a.colCount - 1, c)),
        };
    }, []);

    const focusGrid = useCallback(() => containerRef.current?.focus(), []);
    const markFocused = useCallback((v: boolean) => {
        focusedRef.current = v;
    }, []);

    const moveTo = useCallback(
        (r: number, c: number, extend = false) => {
            const p = clamp(r, c);
            setActiveState(p);
            if (!extend) setAnchorState(p);
        },
        [clamp],
    );

    const selectRange = useCallback(
        (r1: number, c1: number, r2: number, c2: number) => {
            setAnchorState(clamp(r1, c1));
            setActiveState(clamp(r2, c2));
        },
        [clamp],
    );

    const setEditText = useCallback((t: string) => {
        setEdit((ed) => (ed ? { ...ed, text: t } : ed));
    }, []);

    // ── 편집 시작 ─────────────────────────────────────────────
    const beginEdit = useCallback((r: number, c: number, typed?: string) => {
        const a = adapterRef.current;
        const kind = a.cellKind(r, c);
        if (kind === 'readonly') return;
        if (kind === 'toggle') {
            a.toggle?.(r, c);
            return;
        }
        setEdit({ r, c, text: a.editInitial(r, c, typed) });
    }, []);

    const commitEdit = useCallback(
        (moveR: number, moveC: number, pickText?: string) => {
            const ed = editRef.current;
            if (!ed) return;
            const raw = pickText != null ? pickText : ed.text;
            adapterRef.current.commit([{ r: ed.r, c: ed.c, text: raw }], 'edit');
            // 🔴 editRef 를 동기로 비운다 — 아래 focusGrid 가 편집창을 blur 시키고, 그 blur 핸들러가
            //    commitEdit 을 재진입하는데(이중 확정 → 커서가 편집 자리로 되돌아감), 그때 ed 를 null 로 보게 한다.
            editRef.current = null;
            setEdit(null);
            moveTo(ed.r + moveR, ed.c + moveC);
            focusGrid();
        },
        [moveTo, focusGrid],
    );

    const cancelEdit = useCallback(() => {
        editRef.current = null;   // 🔴 commitEdit 과 같은 이유 — focusGrid 가 부르는 blur 재진입을 막는다
        setEdit(null);
        focusGrid();
    }, [focusGrid]);

    // ── 지우기 (선택 범위 비우기) ─────────────────────────────
    const clearSelection = useCallback(() => {
        const a = adapterRef.current;
        const s = selRef.current;
        const changes: CellChange[] = [];
        for (let r = s.r1; r <= Math.min(s.r2, a.dataRowCount - 1); r++) {
            for (let c = s.c1; c <= s.c2; c++) {
                if (!a.editable(r, c)) continue;
                changes.push({ r, c, text: '' });
            }
        }
        if (changes.length) a.commit(changes, 'clear');
    }, []);

    // ── 채우기 (Ctrl+D · 핸들) ────────────────────────────────
    const fillDown = useCallback((toR: number) => {
        const a = adapterRef.current;
        const s = selRef.current;
        const end = Math.min(toR, a.rowCount - 1);
        const changes: CellChange[] = [];
        for (let c = s.c1; c <= s.c2; c++) {
            if (!a.editable(s.r1, c)) continue;
            const src = a.getText(s.r1, c);
            for (let r = s.r1 + 1; r <= end; r++) {
                if (!a.editable(r, c)) continue;
                changes.push({ r, c, text: src });
            }
        }
        if (changes.length) a.commit(changes, 'fill');
    }, []);

    // ── 복사 / 붙이기 ─────────────────────────────────────────
    const buildTsv = useCallback(() => {
        const a = adapterRef.current;
        const s = selRef.current;
        const grid: string[][] = [];
        for (let r = s.r1; r <= s.r2; r++) {
            const cells: string[] = [];
            for (let c = s.c1; c <= s.c2; c++) cells.push(a.getText(r, c));
            grid.push(cells);
        }
        return toTsv(grid);   // 칸 안 탭·줄바꿈은 따옴표로 보존(붙여넣기 매트릭스)
    }, []);

    const doCopy = useCallback(() => {
        const tsv = buildTsv();
        lastCopiedTsv = tsv;
        try {
            void navigator.clipboard?.writeText(tsv);
        } catch {
            /* 조용히 — 내부 대비책(lastCopiedTsv)이 있다 */
        }
        return tsv;
    }, [buildTsv]);

    const doPaste = useCallback((tsv: string, atR?: number, atC?: number) => {
        const a = adapterRef.current;
        const baseR = atR ?? activeRef.current.r;
        const baseC = atC ?? activeRef.current.c;
        const grid = parseClipboard(tsv);   // 따옴표 안 줄바꿈·탭 보존
        if (grid.length === 1 && grid[0].length === 0) return;   // 빈 클립보드
        const changes: CellChange[] = [];
        grid.forEach((line, dr) => {
            line.forEach((raw, dc) => {
                const c = baseC + dc;
                if (c >= a.colCount && !a.growCols) return;   // 열 늘림 능력이 없으면 초과 열은 자른다
                if (c < a.colCount && !a.editable(baseR + dr, c)) return;
                changes.push({ r: baseR + dr, c, text: raw });
            });
        });
        if (changes.length) a.commit(changes, 'paste');
        const lastR = baseR + grid.length - 1;
        const wantC = baseC + Math.max(...grid.map((l) => l.length)) - 1;
        const lastC = a.growCols ? wantC : Math.min(a.colCount - 1, wantC);
        setAnchorState({ r: baseR, c: baseC });
        setActiveState(a.growCols ? { r: clamp(lastR, 0).r, c: lastC } : clamp(lastR, lastC));
    }, [clamp]);

    // ── 문서 레벨 키·복붙 (격자에 포커스가 있을 때만) ─────────
    // impl 에 최신 함수를 담아 리스너는 한 번만 붙인다.
    const impl = useRef({
        moveTo, beginEdit, commitEdit, clearSelection, fillDown, doCopy, doPaste, buildTsv, selectRange,
    });
    impl.current = { moveTo, beginEdit, commitEdit, clearSelection, fillDown, doCopy, doPaste, buildTsv, selectRange };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!focusedRef.current) return;
            if (editRef.current) return; // 편집 중엔 입력창이 처리한다
            const a = adapterRef.current;
            const meta = e.metaKey || e.ctrlKey;
            const k = e.key;
            const act = activeRef.current;
            const u = undoKey(e);   // ⌘Z 판정은 창틀 공용(한글 조합 중·Alt 낀 것 거름) — 더미는 역트랜잭션이라 여기 몫
            if (u) { e.preventDefault(); e.stopPropagation(); if (u === 'redo') a.onRedo?.(); else a.onUndo?.(); return; }
            if (meta && (k === 'c' || k === 'C' || e.code === 'KeyC')) { e.preventDefault(); e.stopPropagation(); impl.current.doCopy(); return; }
            // 🔴 ⌘V 는 preventDefault 하면 안 된다 — 브라우저가 paste 이벤트를 아예 안 쏜다(붙여넣기 먹통이던 원인). paste 이벤트가 처리
            if (meta && (k === 'v' || k === 'V' || e.code === 'KeyV')) { e.stopPropagation(); return; }
            if (meta && (k === 'd' || k === 'D')) { e.preventDefault(); e.stopPropagation(); impl.current.fillDown(selRef.current.r2); return; }
            if (meta && (k === 'a' || k === 'A')) { e.preventDefault(); e.stopPropagation(); setAnchorState({ r: 0, c: 0 }); setActiveState({ r: Math.max(0, a.dataRowCount - 1), c: a.colCount - 1 }); return; }
            // M5 넘버스 — Alt+↑/↓ 위·아래에 행, Alt+←/→ 왼·오른쪽에 열을 넣는다.
            if (e.altKey && !meta && a.insert && k.startsWith('Arrow')) {
                e.preventDefault(); e.stopPropagation();
                if (k === 'ArrowUp') a.insert('row', act.r);
                else if (k === 'ArrowDown') a.insert('row', act.r + 1);
                else if (k === 'ArrowLeft') a.insert('col', act.c);
                else if (k === 'ArrowRight') a.insert('col', act.c + 1);
                return;
            }
            // 격자가 안 쓰는 단축키(Ctrl+S 등)는 껍데기로 흘려보낸다
            if (meta || e.altKey || (/^F\d+$/.test(k) && k !== 'F2')) return;
            e.stopPropagation();
            if (k === 'ArrowDown') { e.preventDefault(); impl.current.moveTo(act.r + 1, act.c, e.shiftKey); return; }
            if (k === 'ArrowUp') { e.preventDefault(); impl.current.moveTo(act.r - 1, act.c, e.shiftKey); return; }
            if (k === 'ArrowLeft') { e.preventDefault(); impl.current.moveTo(act.r, act.c - 1, e.shiftKey); return; }
            if (k === 'ArrowRight') { e.preventDefault(); impl.current.moveTo(act.r, act.c + 1, e.shiftKey); return; }
            if (k === 'Tab') { e.preventDefault(); impl.current.moveTo(act.r, act.c + (e.shiftKey ? -1 : 1)); return; }
            if (k === 'Enter') {
                if (isImeEnter(e)) return;   // 🔴 조합 중 Enter 는 칸 이동을 일으키지 않는다(편집창이 이어받는다)
                e.preventDefault();
                // 스프레드시트 관례 — 선택 상태 Enter = 편집 시작(편집 중 Enter = 저장+아래는 commitEdit). Shift+Enter 는 위로.
                if (e.shiftKey) impl.current.moveTo(act.r - 1, act.c);
                else impl.current.beginEdit(act.r, act.c);
                return;
            }
            if (k === 'F2') { e.preventDefault(); impl.current.beginEdit(act.r, act.c); return; }
            if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); impl.current.clearSelection(); return; }
            if (k === 'Escape') { e.preventDefault(); setAnchorState(activeRef.current); return; }
            if (k === ' ') { e.preventDefault(); if (a.cellKind(act.r, act.c) === 'toggle') impl.current.beginEdit(act.r, act.c); return; }
            // 한글 첫 글자: IME 조합 키/글자 키는 preventDefault 없이 빈 편집창을 동기(flushSync)로 열어
            //  입력창이 그 자리에서 조합을 이어받게 한다.
            if (k === 'Process' || e.isComposing) { flushSync(() => impl.current.beginEdit(act.r, act.c, '')); return; }
            if (!meta && !e.altKey && k.length === 1) { flushSync(() => impl.current.beginEdit(act.r, act.c, '')); return; }
        };
        const onPasteEvt = (e: ClipboardEvent) => {
            if (!focusedRef.current || editRef.current) return;
            const tsv = e.clipboardData?.getData('text/plain') ?? '';
            e.preventDefault(); e.stopPropagation();
            impl.current.doPaste(tsv || lastCopiedTsv);
        };
        const onCopyEvt = (e: ClipboardEvent) => {
            if (!focusedRef.current || editRef.current) return;
            const tsv = impl.current.buildTsv();
            lastCopiedTsv = tsv;
            e.clipboardData?.setData('text/plain', tsv);
            e.preventDefault(); e.stopPropagation();
        };
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('paste', onPasteEvt, true);
        document.addEventListener('copy', onCopyEvt, true);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('paste', onPasteEvt, true);
            document.removeEventListener('copy', onCopyEvt, true);
        };
    }, []);

    // ── 마우스 드래그(범위 · 채우기 핸들) ─────────────────────
    const beginDrag = useCallback((r: number, c: number, e: { button: number; shiftKey: boolean }) => {
        if (e.button !== 0) return;
        focusedRef.current = true;
        focusGrid();
        if (e.shiftKey) {
            setActiveState({ r, c });
        } else {
            setAnchorState({ r, c });
            setActiveState({ r, c });
            dragRef.current = true;
        }
    }, [focusGrid]);

    const onCellEnter = useCallback((r: number, c: number) => {
        if (fillRef.current) setFillTo(Math.max(selRef.current.r2, r));
        else if (dragRef.current) setActiveState({ r, c });
    }, []);

    /** M5 넘버스 흰 점 — 지금 범위의 왼쪽 위를 닻으로 두고, 끄는 대로 오른쪽 아래(active)를 늘린다. */
    const beginExtend = useCallback(() => {
        const s = selRef.current;
        focusedRef.current = true;
        setAnchorState({ r: s.r1, c: s.c1 });
        setActiveState({ r: s.r2, c: s.c2 });
        dragRef.current = true;
    }, []);

    const startFill = useCallback(() => {
        fillRef.current = true;
        setFillTo(selRef.current.r2);
    }, []);

    useEffect(() => {
        const up = () => {
            if (fillRef.current && fillTo != null) fillDown(fillTo);
            dragRef.current = false;
            fillRef.current = false;
            setFillTo(null);
        };
        window.addEventListener('mouseup', up);
        return () => window.removeEventListener('mouseup', up);
    }, [fillTo, fillDown]);

    const onFocus = useCallback(() => {
        focusedRef.current = true;
    }, []);
    const onBlur = useCallback((e: React.FocusEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) focusedRef.current = false;
    }, []);

    // ── 명령형 손잡이 (테스트·호스트) ────────────────────────
    const handle = useMemo<SheetCoreHandle>(() => ({
        focus: () => { focusedRef.current = true; focusGrid(); },
        state: () => ({ active: activeRef.current, anchor: anchorRef.current, editing: !!editRef.current, rows: adapterRef.current.dataRowCount }),
        click: (r, c) => { focusedRef.current = true; focusGrid(); impl.current.moveTo(r, c); },
        select: (r1, c1, r2, c2) => { focusedRef.current = true; focusGrid(); impl.current.selectRange(r1, c1, r2, c2); },
        beginEditAt: (r, c) => { focusedRef.current = true; impl.current.moveTo(r, c); impl.current.beginEdit(r, c); },
        type: (s, r, c) => {
            focusedRef.current = true;
            const rr = r ?? activeRef.current.r;
            const cc = c ?? activeRef.current.c;
            impl.current.moveTo(rr, cc);
            impl.current.beginEdit(rr, cc, s);
        },
        setText: (s) => setEditText(s),
        commit: () => impl.current.commitEdit(1, 0),
        commitPick: (text) => impl.current.commitEdit(1, 0, text),
        press: (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })),
        paste: (tsv, r, c) => { focusedRef.current = true; if (r != null && c != null) impl.current.moveTo(r, c); impl.current.doPaste(tsv, r, c); },
        copy: () => impl.current.doCopy(),
        fill: (toR) => impl.current.fillDown(toR),
        clear: () => impl.current.clearSelection(),
    }), [focusGrid, setEditText]);

    return {
        active, anchor, sel, edit, fillTo, fillActiveRef: fillRef, containerRef,
        inSel, setEditText, beginEdit, commitEdit, cancelEdit, moveTo, setActive, setAnchor,
        focusGrid, markFocused, onFocus, onBlur, beginDrag, onCellEnter, startFill, beginExtend, handle,
    };
}
