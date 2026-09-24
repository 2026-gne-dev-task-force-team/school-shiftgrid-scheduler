/**
 * 스토어 — 앱의 저장 세계(Doc) + 화면 상태를 한곳에서.
 *  · Doc 변경은 전부 이력(undo/redo, 최대 200)으로 쌓인다.
 *  · dirty·파일 경로를 들고, 변경 2초 뒤 platform.autosave 로 조용히 보관한다.
 *  · 큰 변경(솔버 적용·자동조정·판 복원)마다 auto 스냅샷(Board)을 쌓는다(최대 30).
 *  · 진단·수요현황은 엔진에서 계산해 useMemo 로 잡아 둔다. 엔진이 던지면 세 줄 오류로 보여준다.
 */
import {
    createContext, useContext, useMemo, useReducer, useState, useEffect, useRef, useCallback,
    type ReactNode,
} from 'react';
import type { Doc } from '../types/doc';
import { emptyDoc, migrateDoc } from '../types/doc';
import type { OpenedDoc } from '../platform';
import type {
    Agent, Activity, Resource, Track, Assignment, Blackout, Demand,
    ConflictRule, TargetRef, RuleParams, SchoolMeta,
} from '../types/schema';
import {
    diagnose, demandStatus, applyMove, defaultRules, makeSpec,
    type Diagnosis, type DemandStatus, type Move, type MakeSpecInput,
} from '../engine/api';
import { platform } from '../platform';
import { sampleDoc } from '../io/sample';
import * as ops from './doc-ops';
import type { CellPos, BlockState } from './doc-ops';
import { uid } from './ids';

export type { CellPos } from './doc-ops';

// ── 화면 ──────────────────────────────────────────────────────
export type ScreenId = 'home' | 'basic' | 'blocks' | 'generate' | 'diagnose' | 'edit' | 'boards' | 'export';

export interface EditFocus {
    trackId?: string;
    agentId?: string;
    resourceId?: string;
    view?: 'track' | 'agent' | 'resource';
    dayIndex?: number;
    slotIndex?: number;
    ruleId?: string;
}

// ── 알림(세 줄 오류) ─────────────────────────────────────────
export interface Notice {
    id: string;
    kind: 'error' | 'info';
    title: string;
    lines: string[]; // 오류면 [무엇이, 왜, 다음에]
}

// ── 이력 ──────────────────────────────────────────────────────
const EMPTY_DIAG: Diagnosis = { hardCount: 0, softWeight: 0, rules: [], daysByRule: {} };

interface Snap { label: string; score?: { hard: number; soft: number }; }
interface HistState { past: Doc[]; present: Doc; future: Doc[]; dirty: boolean; }
type HistAction =
    | { t: 'commit'; recipe: (d: Doc) => Doc; snap?: Snap }
    | { t: 'undo' } | { t: 'redo' }
    | { t: 'reset'; doc: Doc } | { t: 'saved' };

const MAX_HIST = 200;

function histReducer(s: HistState, a: HistAction): HistState {
    switch (a.t) {
        case 'commit': {
            let next = a.recipe(s.present);
            if (next === s.present) return s;
            if (a.snap) next = ops.autoSnapshot(next, a.snap.label, a.snap.score);
            const past = [...s.past, s.present];
            if (past.length > MAX_HIST) past.shift();
            return { past, present: next, future: [], dirty: true };
        }
        case 'undo': {
            if (s.past.length === 0) return s;
            const prev = s.past[s.past.length - 1];
            return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future], dirty: true };
        }
        case 'redo': {
            if (s.future.length === 0) return s;
            const nx = s.future[0];
            return { past: [...s.past, s.present], present: nx, future: s.future.slice(1), dirty: true };
        }
        case 'reset':
            return { past: [], present: a.doc, future: [], dirty: false };
        case 'saved':
            return { ...s, dirty: false };
        default:
            return s;
    }
}

// ── 규칙이 비어 있으면 기본 규칙으로 채운다 (엔진 stub 이면 빈 배열) ──
function withDefaultRules(d: Doc): Doc {
    if (d.rules.length > 0) return d;
    try {
        const r = defaultRules();
        return r.length > 0 ? { ...d, rules: r } : d;
    } catch { return d; }
}

// ── 컨텍스트 ──────────────────────────────────────────────────
interface StoreValue {
    doc: Doc;
    path: string | undefined;
    dirty: boolean;
    hasAutosave: boolean;
    canUndo: boolean; canRedo: boolean;
    undo: () => void; redo: () => void;

    diag: Diagnosis;
    demand: DemandStatus[];

    notices: Notice[];
    notify: (n: Omit<Notice, 'id'>) => void;
    dismiss: (id: string) => void;
    /** 엔진 호출을 감싸 던지면 세 줄 오류로 띄우고 undefined 를 돌려준다 */
    runEngine: <T>(what: string, fn: () => T) => T | undefined;
    runEngineAsync: <T>(what: string, fn: () => Promise<T>) => Promise<T | undefined>;

    screen: ScreenId;
    setScreen: (s: ScreenId) => void;
    focus: EditFocus;
    setFocus: (f: EditFocus) => void;
    /** 진단→편집 점프 */
    jumpToEdit: (f: EditFocus) => void;

    act: Actions;

    newDoc: () => void;
    loadSample: () => void;
    openFile: () => Promise<void>;
    loadOpened: (r: OpenedDoc) => void;
    saveFile: () => Promise<void>;
    saveFileAs: () => Promise<void>;
    resume: () => void;
    dismissResume: () => void;
}

interface Actions {
    setMeta: (patch: Partial<SchoolMeta>) => void;
    addAgent: (name: string, extra?: Partial<Agent>) => void;
    updateAgent: (id: string, patch: Partial<Agent>) => void;
    removeAgent: (id: string) => void;
    addActivity: (name: string) => void;
    updateActivity: (id: string, patch: Partial<Activity>) => void;
    removeActivity: (id: string) => void;
    addResource: (name: string, extra?: Partial<Resource>) => void;
    updateResource: (id: string, patch: Partial<Resource>) => void;
    removeResource: (id: string) => void;
    addSpec: (input: MakeSpecInput) => void;
    removeSpec: (id: string) => void;
    addTrack: (name: string, specId: string, grade?: number) => void;
    updateTrack: (id: string, patch: Partial<Track>) => void;
    removeTrack: (id: string) => void;
    addDemand: (dm: Omit<Demand, 'id'>) => void;
    addDemandsBulk: (base: Omit<Demand, 'id' | 'trackId'>, trackIds: string[]) => void;
    updateDemand: (id: string, patch: Partial<Demand>) => void;
    removeDemand: (id: string) => void;
    duplicateDemand: (id: string) => void;
    cycleBlock: (target: TargetRef, dayIndex: number, slotIndex: number) => void;
    setBlockState: (target: TargetRef, dayIndex: number, slotIndex: number, state: BlockState) => void;
    clearTempBlocks: () => void;
    addBlackout: (b: Omit<Blackout, 'id'>) => void;
    removeBlackout: (id: string) => void;
    setCell: (pos: CellPos, patch: Partial<Assignment>) => void;
    clearCell: (pos: CellPos) => void;
    addFixed: (pos: CellPos, activityId: string | undefined, label: string) => void;
    togglePin: (id: string) => void;
    toggleTemp: (id: string) => void;
    applyMove: (move: Move) => void;
    applyAssignments: (assignments: Assignment[], label: string, score?: { hard: number; soft: number }) => void;
    toggleRule: (id: string) => void;
    updateRuleParams: (id: string, params: RuleParams) => void;
    setRules: (rules: ConflictRule[]) => void;
    mergeImport: (r: { agents: Agent[]; tracks: Track[]; activities: Activity[]; demands: Demand[] }) => void;
    syncTracks: (tracks: Track[]) => void;
    syncAgents: (agents: Agent[]) => void;
    syncActivities: (activities: Activity[]) => void;
    syncResources: (resources: Resource[]) => void;
    applyDemandSheet: (p: { newAgents: Agent[]; newActivities: Activity[]; newTracks: Track[]; demands: Demand[] }) => void;
    makeTracksByGrade: (counts: Record<number, number>, specId: string) => void;
    saveBoard: (name: string) => void;
    restoreBoard: (id: string) => void;
    publishBoard: (id: string) => void;
    deleteBoard: (id: string) => void;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
    const [hist, dispatch] = useReducer(histReducer, undefined, () => ({
        past: [], present: withDefaultRules(emptyDoc()), future: [], dirty: false,
    }));
    const doc = hist.present;

    const [path, setPath] = useState<string | undefined>(undefined);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [screen, setScreen] = useState<ScreenId>('home');
    const [focus, setFocus] = useState<EditFocus>({});
    const [autosaveDoc, setAutosaveDoc] = useState<Doc | null>(null);
    const [resumeShown, setResumeShown] = useState(true);

    // 첫 기동: 자동 보관본이 있으면 이어 할지 배너로 물어본다
    useEffect(() => {
        let live = true;
        (async () => {
            try { const d = await platform.loadAutosave(); if (live && d) setAutosaveDoc(d); } catch { /* 조용히 */ }
        })();
        return () => { live = false; };
    }, []);

    // 자동저장 — 변경 뒤 2초 디바운스
    const firstRun = useRef(true);
    useEffect(() => {
        if (firstRun.current) { firstRun.current = false; return; }
        if (!hist.dirty) return;
        const id = setTimeout(() => { platform.autosave(doc).catch(() => { /* 조용히 */ }); }, 2000);
        return () => clearTimeout(id);
    }, [doc, hist.dirty]);

    const notify = useCallback((n: Omit<Notice, 'id'>) => {
        setNotices((list) => [...list, { ...n, id: uid('nt') }].slice(-5));
    }, []);
    const dismiss = useCallback((id: string) => setNotices((l) => l.filter((n) => n.id !== id)), []);

    const runEngine = useCallback(<T,>(what: string, fn: () => T): T | undefined => {
        try { return fn(); }
        catch (e) {
            notify({
                kind: 'error', title: `${what} 을(를) 못 했습니다`,
                lines: [`${what} 을(를) 하려다 멈췄습니다.`, msgOf(e), '엔진이 아직 스텁이라 그렇습니다. 통합되면 사라집니다.'],
            });
            return undefined;
        }
    }, [notify]);

    const runEngineAsync = useCallback(async <T,>(what: string, fn: () => Promise<T>): Promise<T | undefined> => {
        try { return await fn(); }
        catch (e) {
            notify({
                kind: 'error', title: `${what} 을(를) 못 했습니다`,
                lines: [`${what} 을(를) 하려다 멈췄습니다.`, msgOf(e), '엔진이 아직 스텁이라 그렇습니다. 통합되면 사라집니다.'],
            });
            return undefined;
        }
    }, [notify]);

    // 진단·수요현황 — 엔진이 던져도 화면이 죽지 않게 안전하게
    const diag = useMemo<Diagnosis>(() => {
        try { return diagnose(doc); } catch { return EMPTY_DIAG; }
    }, [doc]);
    const demand = useMemo<DemandStatus[]>(() => {
        try { return demandStatus(doc); } catch { return []; }
    }, [doc]);

    const commit = useCallback((recipe: (d: Doc) => Doc, snap?: Snap) => dispatch({ t: 'commit', recipe, snap }), []);

    // ── 액션 ──────────────────────────────────────────────────
    const act = useMemo<Actions>(() => ({
        setMeta: (patch) => commit((d) => ops.setMeta(d, patch)),
        addAgent: (name, extra) => commit((d) => ops.addAgent(d, name, extra)),
        updateAgent: (id, patch) => commit((d) => ops.updateAgent(d, id, patch)),
        removeAgent: (id) => commit((d) => ops.removeAgent(d, id)),
        addActivity: (name) => commit((d) => ops.addActivity(d, name)),
        updateActivity: (id, patch) => commit((d) => ops.updateActivity(d, id, patch)),
        removeActivity: (id) => commit((d) => ops.removeActivity(d, id)),
        addResource: (name, extra) => commit((d) => ops.addResource(d, name, extra)),
        updateResource: (id, patch) => commit((d) => ops.updateResource(d, id, patch)),
        removeResource: (id) => commit((d) => ops.removeResource(d, id)),
        addSpec: (input) => {
            const spec = runEngine('시간 규격 만들기', () => makeSpec(input));
            if (spec) commit((d) => ops.addSpec(d, spec));
        },
        removeSpec: (id) => commit((d) => ops.removeSpec(d, id)),
        addTrack: (name, specId, grade) => commit((d) => ops.addTrack(d, name, specId, grade)),
        updateTrack: (id, patch) => commit((d) => ops.updateTrack(d, id, patch)),
        removeTrack: (id) => commit((d) => ops.removeTrack(d, id)),
        addDemand: (dm) => commit((d) => ops.addDemand(d, dm)),
        addDemandsBulk: (base, trackIds) => commit((d) => ops.addDemandsBulk(d, base, trackIds)),
        updateDemand: (id, patch) => commit((d) => ops.updateDemand(d, id, patch)),
        removeDemand: (id) => commit((d) => ops.removeDemand(d, id)),
        duplicateDemand: (id) => commit((d) => ops.duplicateDemand(d, id)),
        cycleBlock: (target, dayIndex, slotIndex) => commit((d) => ops.cycleBlock(d, target, dayIndex, slotIndex)),
        setBlockState: (target, dayIndex, slotIndex, state) => commit((d) => ops.setBlockState(d, target, dayIndex, slotIndex, state)),
        clearTempBlocks: () => commit((d) => ops.clearTempBlocks(d)),
        addBlackout: (b) => commit((d) => ops.addBlackout(d, b)),
        removeBlackout: (id) => commit((d) => ops.removeBlackout(d, id)),
        setCell: (pos, patch) => commit((d) => ops.setCell(d, pos, patch)),
        clearCell: (pos) => commit((d) => ops.clearCell(d, pos)),
        addFixed: (pos, activityId, label) => commit((d) => ops.addFixed(d, pos, activityId, label)),
        togglePin: (id) => commit((d) => ops.togglePinAt(d, id)),
        toggleTemp: (id) => commit((d) => ops.toggleTempAt(d, id)),
        applyMove: (move) => {
            const next = runEngine('이동 실행', () => applyMove(doc, move));
            if (next) commit(() => next);
        },
        applyAssignments: (assignments, label, score) =>
            commit((d) => ops.applyAssignments(d, assignments), { label, score }),
        toggleRule: (id) => commit((d) => ops.toggleRule(d, id)),
        updateRuleParams: (id, params) => commit((d) => ops.updateRuleParams(d, id, params)),
        setRules: (rules) => commit((d) => ops.setRules(d, rules)),
        mergeImport: (r) => commit((d) => ops.mergeImport(d, r)),
        syncTracks: (tracks) => commit((d) => ops.syncTracks(d, tracks)),
        syncAgents: (agents) => commit((d) => ops.syncAgents(d, agents)),
        syncActivities: (activities) => commit((d) => ops.syncActivities(d, activities)),
        syncResources: (resources) => commit((d) => ops.syncResources(d, resources)),
        applyDemandSheet: (p) => commit((d) => ops.applyDemandSheet(d, p)),
        makeTracksByGrade: (counts, specId) => commit((d) => ops.makeTracksByGrade(d, counts, specId)),
        saveBoard: (name) => commit((d) => ops.saveBoard(d, name, { hard: diag.hardCount, soft: diag.softWeight })),
        restoreBoard: (id) => commit((d) => ops.restoreBoard(d, id), { label: '복원 직전 자동 스냅샷' }),
        publishBoard: (id) => commit((d) => ops.publishBoard(d, id)),
        deleteBoard: (id) => commit((d) => ops.deleteBoard(d, id)),
    }), [commit, runEngine, doc, diag.hardCount, diag.softWeight]);

    // ── 파일 ──────────────────────────────────────────────────
    const newDoc = useCallback(() => {
        dispatch({ t: 'reset', doc: withDefaultRules(emptyDoc()) });
        setPath(undefined); setScreen('basic');
    }, []);
    const loadSample = useCallback(() => {
        const d = runEngine('샘플 학교 불러오기', () => sampleDoc());
        if (d) { dispatch({ t: 'reset', doc: withDefaultRules(d) }); setPath(undefined); setScreen('basic'); }
    }, [runEngine]);
    const openFile = useCallback(async () => {
        const r = await runEngineAsync('파일 열기', () => platform.openDoc());
        if (r) { dispatch({ t: 'reset', doc: withDefaultRules(r.doc) }); setPath(r.path); setScreen('basic'); }
    }, [runEngineAsync]);
    /** 껍데기(Electron 메뉴)가 이미 열어 넘겨준 문서를 받는다 */
    const loadOpened = useCallback((r: OpenedDoc) => {
        dispatch({ t: 'reset', doc: withDefaultRules(migrateDoc(r.doc)) }); setPath(r.path); setScreen('basic');
    }, []);
    const saveFile = useCallback(async () => {
        const p = await runEngineAsync('저장', () => platform.saveDoc(doc, path));
        if (p) { setPath(p); dispatch({ t: 'saved' }); }
    }, [doc, path, runEngineAsync]);
    const saveFileAs = useCallback(async () => {
        const p = await runEngineAsync('다른 이름으로 저장', () => platform.saveDocAs(doc));
        if (p) { setPath(p); dispatch({ t: 'saved' }); }
    }, [doc, runEngineAsync]);
    const resume = useCallback(() => {
        if (autosaveDoc) { dispatch({ t: 'reset', doc: withDefaultRules(autosaveDoc) }); setAutosaveDoc(null); setScreen('basic'); }
    }, [autosaveDoc]);
    const dismissResume = useCallback(() => { setResumeShown(false); }, []);

    const jumpToEdit = useCallback((f: EditFocus) => { setFocus(f); setScreen('edit'); }, []);

    const value: StoreValue = {
        doc, path, dirty: hist.dirty,
        hasAutosave: !!autosaveDoc && resumeShown,
        canUndo: hist.past.length > 0, canRedo: hist.future.length > 0,
        undo: () => dispatch({ t: 'undo' }), redo: () => dispatch({ t: 'redo' }),
        diag, demand,
        notices, notify, dismiss, runEngine, runEngineAsync,
        screen, setScreen, focus, setFocus, jumpToEdit,
        act,
        newDoc, loadSample, openFile, loadOpened, saveFile, saveFileAs, resume, dismissResume,
    };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function msgOf(e: unknown): string {
    if (e instanceof Error) return e.message;
    return String(e);
}

export function useStore(): StoreValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('useStore 는 StoreProvider 안에서만');
    return v;
}
