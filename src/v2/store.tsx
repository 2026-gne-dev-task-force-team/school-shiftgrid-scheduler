/**
 * v2 스토어 — 작업대의 저장 세계(Project) + 창 배치(Layout) + 고른 것.
 *  · Project 변경은 되돌리기(undo/redo) 이력으로 쌓인다. Layout(창 배치)은 이력에 안 넣는다(v1 과 같은 결 — 되돌리기는 자료만).
 *  · 변경 2초 뒤 v2 전용 자동 보관.
 *  · v1 파일을 열면 변환 리포트를 띄우고, 개수가 안 맞으면 저장을 막는다.
 */
import {
    createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
    type ReactNode,
} from 'react';
import type { OwnerRef, Project, Sheet } from './model';
import type { Slot, TimetableSpec } from '../types/schema';
import * as ops from './ops';
import type { Layout } from './ops';
import type { SlotRule } from './defaults';
import type { MigrationReport } from './migrate';
import { verifyProjectIntegrity } from './migrate';
import * as persist from './persist';
import { uid } from '../store/ids';

export type Selection = { kind: 'project' } | { kind: 'sheet'; id: string };

export interface Notice { id: string; kind: 'error' | 'info'; title: string; lines: string[]; }

// ── 이력 ──
interface Hist { past: Project[]; present: Project; future: Project[]; dirty: boolean; }
type HistAction =
    | { t: 'commit'; next: Project }
    | { t: 'undo' } | { t: 'redo' }
    | { t: 'reset'; project: Project } | { t: 'saved' };
const MAX_HIST = 200;

function histReducer(s: Hist, a: HistAction): Hist {
    switch (a.t) {
        case 'commit': {
            if (a.next === s.present) return s;
            const past = [...s.past, s.present];
            if (past.length > MAX_HIST) past.shift();
            return { past, present: a.next, future: [], dirty: true };
        }
        case 'undo': {
            if (s.past.length === 0) return s;
            const prev = s.past[s.past.length - 1];
            return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future], dirty: true };
        }
        case 'redo': {
            if (s.future.length === 0) return s;
            return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1), dirty: true };
        }
        case 'reset': return { past: [], present: a.project, future: [], dirty: false };
        case 'saved': return { ...s, dirty: false };
        default: return s;
    }
}

interface V2Store {
    project: Project;
    layout: Layout;
    selection: Selection;
    dirty: boolean;
    canUndo: boolean; canRedo: boolean;
    notices: Notice[];
    /** v1 변환 리포트 — 배너로 보여준다. 닫으면 null */
    report: MigrationReport | null;
    hasAutosave: boolean;

    // 탐색기
    newSheet: () => void;
    renameSheet: (id: string, name: string) => void;
    removeSheet: (id: string) => void;
    restoreSheet: (id: string) => void;
    purgeTrash: (id: string) => void;

    // 창
    openSheet: (id: string) => void;
    closeTab: (winId: string, id: string) => void;
    activateTab: (winId: string, id: string) => void;
    focusWindow: (winId: string) => void;
    split: (winId: string, dir: 'row' | 'col') => void;
    closePane: (winId: string) => void;
    setRatio: (splitId: string, ratio: number) => void;

    // 표 편집
    setCell: (sheetId: string, colKey: string, rowKey: string, text: string) => void;
    setPeriods: (sheetId: string, periods: number) => void;
    stepPeriods: (sheetId: string, delta: number) => void;
    setDays: (sheetId: string, days: number) => void;
    updateSlot: (sheetId: string, slotIndex: number, patch: Partial<Slot>) => void;
    editSlotTime: (sheetId: string, slotIndex: number, patch: { start?: string; end?: string }, pushFollowing: boolean) => void;
    applySlotRule: (sheetId: string, rule: SlotRule) => void;
    setRowHeight: (sheetId: string, px: number) => void;
    updateSheetSpec: (sheetId: string, spec: TimetableSpec) => void;
    setSheetOwner: (sheetId: string, owner: OwnerRef | undefined) => void;

    // 속성·선택
    select: (sel: Selection) => void;
    setProjectMeta: (patch: { name?: string; term?: string }) => void;

    // 이력·파일
    undo: () => void; redo: () => void;
    newProject: () => void;
    openFile: () => Promise<void>;
    saveFile: () => Promise<void>;
    resume: () => void; dismissResume: () => void;
    dismissReport: () => void;
    dismissNotice: (id: string) => void;

    getSheet: (id: string | null | undefined) => Sheet | undefined;
}

const Ctx = createContext<V2Store | null>(null);

export function V2StoreProvider({ children }: { children: ReactNode }) {
    const [hist, dispatch] = useReducer(histReducer, undefined, () => ({
        past: [], present: ops.newProject(), future: [], dirty: false,
    }));
    const project = hist.present;

    const [layout, setLayout] = useState<Layout>(() => ops.newLayout());
    const [selection, setSelection] = useState<Selection>({ kind: 'project' });
    const [notices, setNotices] = useState<Notice[]>([]);
    const [report, setReport] = useState<MigrationReport | null>(null);
    const [autosaved, setAutosaved] = useState<Project | null>(null);
    const [resumeShown, setResumeShown] = useState(true);

    const commit = useCallback((next: Project) => dispatch({ t: 'commit', next }), []);
    const notify = useCallback((n: Omit<Notice, 'id'>) => setNotices((l) => [...l, { ...n, id: uid('nt') }].slice(-5)), []);
    const dismissNotice = useCallback((id: string) => setNotices((l) => l.filter((n) => n.id !== id)), []);

    // 첫 기동: 자동 보관본이 있으면 이어 할지 묻는다
    useEffect(() => {
        const d = persist.loadAutosaveProject();
        if (d && (d.sheets.length > 0 || d.trash.length > 0)) setAutosaved(d);
    }, []);

    // 자동 보관 — 2초 디바운스
    const first = useRef(true);
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        if (!hist.dirty) return;
        const id = setTimeout(() => persist.autosaveProject(project), 2000);
        return () => clearTimeout(id);
    }, [project, hist.dirty]);

    const getSheet = useCallback((id: string | null | undefined) => ops.getSheet(project, id), [project]);

    // ── 탐색기 ──
    const newSheet = useCallback(() => {
        const { project: np, sheet } = ops.createSheet(project);
        commit(np);
        setLayout((l) => ops.openInActive(l, sheet.id));
        setSelection({ kind: 'sheet', id: sheet.id });
    }, [project, commit]);

    const renameSheet = useCallback((id: string, name: string) => commit(ops.renameSheet(project, id, name)), [project, commit]);

    const removeSheet = useCallback((id: string) => {
        commit(ops.deleteSheet(project, id));
        setLayout((l) => ops.closeSheetEverywhere(l, id));
        setSelection((s) => (s.kind === 'sheet' && s.id === id ? { kind: 'project' } : s));
    }, [project, commit]);

    const restoreSheet = useCallback((id: string) => commit(ops.restoreSheet(project, id)), [project, commit]);
    const purgeTrash = useCallback((id: string) => commit(ops.purgeTrash(project, id)), [project, commit]);

    // ── 창 ──
    const openSheet = useCallback((id: string) => setLayout((l) => ops.openInActive(l, id)), []);
    const closeTab = useCallback((winId: string, id: string) => setLayout((l) => ops.closeTab(l, winId, id)), []);
    const activateTab = useCallback((winId: string, id: string) => setLayout((l) => ops.activateTab(l, winId, id)), []);
    const focusWindow = useCallback((winId: string) => setLayout((l) => ops.focusWindow(l, winId)), []);
    const split = useCallback((winId: string, dir: 'row' | 'col') => setLayout((l) => ops.splitWindow(l, winId, dir)), []);
    const closePane = useCallback((winId: string) => setLayout((l) => ops.closePane(l, winId)), []);
    const setRatio = useCallback((splitId: string, ratio: number) => setLayout((l) => ops.setRatio(l, splitId, ratio)), []);

    // ── 표 편집 ──
    const setCell = useCallback((sheetId: string, colKey: string, rowKey: string, text: string) =>
        commit(ops.setSheetCell(project, sheetId, colKey, rowKey, text)), [project, commit]);
    const setPeriods = useCallback((sheetId: string, periods: number) => commit(ops.setPeriods(project, sheetId, periods)), [project, commit]);
    const stepPeriods = useCallback((sheetId: string, delta: number) => commit(ops.stepPeriods(project, sheetId, delta)), [project, commit]);
    const setDays = useCallback((sheetId: string, days: number) => commit(ops.setDays(project, sheetId, days)), [project, commit]);
    const updateSlot = useCallback((sheetId: string, slotIndex: number, patch: Partial<Slot>) => commit(ops.updateSlot(project, sheetId, slotIndex, patch)), [project, commit]);
    const editSlotTime = useCallback((sheetId: string, slotIndex: number, patch: { start?: string; end?: string }, pushFollowing: boolean) => commit(ops.editSlotTime(project, sheetId, slotIndex, patch, pushFollowing)), [project, commit]);
    const applySlotRule = useCallback((sheetId: string, rule: SlotRule) => commit(ops.applySlotRule(project, sheetId, rule)), [project, commit]);
    const setRowHeight = useCallback((sheetId: string, px: number) => commit(ops.setRowHeight(project, sheetId, px)), [project, commit]);
    const updateSheetSpec = useCallback((sheetId: string, spec: TimetableSpec) => commit(ops.updateSheetSpec(project, sheetId, spec)), [project, commit]);
    const setSheetOwner = useCallback((sheetId: string, owner: OwnerRef | undefined) => commit(ops.setSheetOwner(project, sheetId, owner)), [project, commit]);

    // ── 속성·선택 ──
    const select = useCallback((sel: Selection) => setSelection(sel), []);
    const setProjectMeta = useCallback((patch: { name?: string; term?: string }) => commit(ops.setProjectMeta(project, patch)), [project, commit]);

    // ── 이력·파일 ──
    const undo = useCallback(() => dispatch({ t: 'undo' }), []);
    const redo = useCallback(() => dispatch({ t: 'redo' }), []);

    const newProject = useCallback(() => {
        dispatch({ t: 'reset', project: ops.newProject() });
        setLayout(ops.newLayout());
        setSelection({ kind: 'project' });
        setReport(null);
    }, []);

    const openFile = useCallback(async () => {
        try {
            const opened = await persist.openProject();
            if (!opened) return;
            dispatch({ t: 'reset', project: opened.project });
            setLayout(ops.newLayout());
            setSelection({ kind: 'project' });
            setReport(opened.report);
            if (opened.report && !opened.report.ok) {
                notify({
                    kind: 'error', title: '변환 중 항목 수가 안 맞습니다',
                    lines: [
                        `원본 ${opened.report.sourceTotal}개 · 보관 ${opened.report.heldTotal}개로 어긋났습니다.`,
                        '한 항목이라도 잃으면 안 되므로 이 파일은 저장이 막힙니다.',
                        '담당자에게 이 파일을 보내 주세요.',
                    ],
                });
            }
        } catch (e) {
            notify({ kind: 'error', title: '파일 열기 실패', lines: ['파일을 읽지 못했습니다.', msgOf(e), '다른 파일로 다시 시도해 보세요.'] });
        }
    }, [notify]);

    const saveFile = useCallback(async () => {
        const check = verifyProjectIntegrity(project);
        if (check && !check.ok) {
            notify({
                kind: 'error', title: '저장을 막았습니다',
                lines: [
                    `들고 있는 항목 수가 원본과 안 맞습니다(원본 ${check.sourceTotal} · 지금 ${check.heldTotal}).`,
                    'v1 에서 가져온 내용이 사라질 수 있어 저장하지 않습니다.',
                    '담당자에게 알려 주세요.',
                ],
            });
            return;
        }
        try {
            const name = await persist.saveProjectAs(project);
            dispatch({ t: 'saved' });
            notify({ kind: 'info', title: `저장했습니다 — ${name}`, lines: [] });
        } catch (e) {
            notify({ kind: 'error', title: '저장 실패', lines: ['저장하지 못했습니다.', msgOf(e), '다시 시도해 보세요.'] });
        }
    }, [project, notify]);

    const resume = useCallback(() => {
        if (!autosaved) return;
        dispatch({ t: 'reset', project: autosaved });
        setLayout(ops.newLayout());
        setAutosaved(null);
    }, [autosaved]);
    const dismissResume = useCallback(() => setResumeShown(false), []);
    const dismissReport = useCallback(() => setReport(null), []);

    const value: V2Store = useMemo(() => ({
        project, layout, selection,
        dirty: hist.dirty, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0,
        notices, report, hasAutosave: !!autosaved && resumeShown,
        newSheet, renameSheet, removeSheet, restoreSheet, purgeTrash,
        openSheet, closeTab, activateTab, focusWindow, split, closePane, setRatio,
        setCell, setPeriods, stepPeriods, setDays, updateSlot, editSlotTime, applySlotRule, setRowHeight, updateSheetSpec, setSheetOwner,
        select, setProjectMeta,
        undo, redo, newProject, openFile, saveFile, resume, dismissResume, dismissReport, dismissNotice,
        getSheet,
    }), [
        project, layout, selection, hist.dirty, hist.past.length, hist.future.length,
        notices, report, autosaved, resumeShown,
        newSheet, renameSheet, removeSheet, restoreSheet, purgeTrash,
        openSheet, closeTab, activateTab, focusWindow, split, closePane, setRatio,
        setCell, setPeriods, stepPeriods, setDays, updateSlot, editSlotTime, applySlotRule, setRowHeight, updateSheetSpec, setSheetOwner,
        select, setProjectMeta,
        undo, redo, newProject, openFile, saveFile, resume, dismissResume, dismissReport, dismissNotice,
        getSheet,
    ]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function msgOf(e: unknown): string { return e instanceof Error ? e.message : String(e); }

export function useV2(): V2Store {
    const v = useContext(Ctx);
    if (!v) throw new Error('useV2 는 V2StoreProvider 안에서만');
    return v;
}
