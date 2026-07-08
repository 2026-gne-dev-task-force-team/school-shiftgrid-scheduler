/**
 * 스토어 — 앱의 '저장 세계(Doc)'와 화면 상태(UI)를 한곳에서 관리한다.
 *  - Doc(엔티티·배치·규칙…)의 모든 변경은 이력으로 쌓여 되돌리기/다시하기가 된다.
 *  - 충돌 목록은 저장하지 않고 Doc이 바뀔 때마다 다시 계산한다(실시간 검증).
 */
import {
    createContext, useContext, useMemo, useReducer, useState, useCallback,
    type ReactNode,
} from 'react';
import type {
    Agent, Activity, Resource, Track, Assignment, Blackout, ConflictRule,
} from '../types/schema';
import {
    AGENTS, ACTIVITIES, RESOURCES, SPECS, TRACKS, TIMETABLES,
    BLACKOUTS, buildSeedAssignments, baseTimetableOf,
} from '../model/seed';
import { type Doc, runValidation } from '../logic/logic';

let counter = 0;
const uid = (p: string) => `${p}-${(counter++).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

// ── 엔티티 계열 이름 (교사·교과·시설) ─────────────────────────
export type EntityFamily = 'agents' | 'activities' | 'resources';
const KIND_OF: Record<EntityFamily, Agent['kind'] | Activity['kind'] | Resource['kind']> = {
    agents: 'agent', activities: 'activity', resources: 'resource',
};

// ── Doc(저장 세계) 변경 액션 ──────────────────────────────────
export type CellField = 'agentId' | 'activityId' | 'resourceId';
export interface CellPos { trackId: string; dayIndex: number; slotIndex: number; }
export type BlockCell = Partial<Record<CellField, string>> | null;

type DocAction =
    | { type: 'ADD_ENTITY'; family: EntityFamily; name: string; color: string }
    | { type: 'REMOVE_ENTITY'; family: EntityFamily; id: string }
    | { type: 'RENAME_ENTITY'; family: EntityFamily; id: string; name: string }
    | { type: 'ADD_SPEC'; name: string }
    | { type: 'REMOVE_SPEC'; id: string }
    | { type: 'ADD_TRACK'; specId: string; name: string }
    | { type: 'REMOVE_TRACK'; id: string }
    | { type: 'SET_CELL'; pos: CellPos; patch: Partial<Record<CellField, string | undefined>> }
    | { type: 'CLEAR_CELLS'; cells: CellPos[] }
    | { type: 'PASTE'; trackId: string; top: number; left: number; block: BlockCell[][] }
    | { type: 'ADD_RULE'; rule: ConflictRule }
    | { type: 'UPDATE_RULE'; id: string; patch: Partial<ConflictRule> }
    | { type: 'REMOVE_RULE'; id: string }
    | { type: 'ADD_BLACKOUT'; blackout: Blackout }
    | { type: 'REMOVE_BLACKOUT'; id: string };

// ── 배치 한 칸을 만들거나 고치는 도우미 ───────────────────────
function upsertCell(doc: Doc, pos: CellPos, patch: Partial<Record<CellField, string | undefined>>): Assignment[] {
    const list = doc.assignments.slice();
    const idx = list.findIndex(
        (a) => a.trackId === pos.trackId && a.dayIndex === pos.dayIndex && a.slotIndex === pos.slotIndex,
    );
    const isEmpty = (a: Assignment) => !a.agentId && !a.activityId && !a.resourceId && !a.label;

    if (idx >= 0) {
        const merged = { ...list[idx], ...patch };
        if (isEmpty(merged)) list.splice(idx, 1);
        else list[idx] = merged;
    } else {
        const track = doc.tracks.find((t) => t.id === pos.trackId);
        if (!track) return list;
        const na: Assignment = {
            kind: 'work', id: uid('w'), timetableId: baseTimetableOf(track),
            trackId: pos.trackId, dayIndex: pos.dayIndex, slotIndex: pos.slotIndex, ...patch,
        };
        if (!isEmpty(na)) list.push(na);
    }
    return list;
}

function docReducer(doc: Doc, action: DocAction): Doc {
    switch (action.type) {
        case 'ADD_ENTITY': {
            const item = { kind: KIND_OF[action.family], id: uid(action.family), name: action.name, attr: { color: action.color } };
            return { ...doc, [action.family]: [...doc[action.family], item as never] };
        }
        case 'REMOVE_ENTITY':
            return { ...doc, [action.family]: doc[action.family].filter((x) => x.id !== action.id) };
        case 'RENAME_ENTITY':
            return {
                ...doc,
                [action.family]: doc[action.family].map((x) => (x.id === action.id ? { ...x, name: action.name } : x)),
            };
        case 'ADD_SPEC': {
            const base = SPECS[1]; // 고학년 규격을 기본 틀로 복제
            const spec = { ...base, id: uid('spec'), name: action.name, attr: { ...base.attr } };
            return { ...doc, specs: [...doc.specs, spec] };
        }
        case 'REMOVE_SPEC': {
            const trackIds = doc.tracks.filter((t) => t.attr?.specId === action.id).map((t) => t.id);
            return {
                ...doc,
                specs: doc.specs.filter((s) => s.id !== action.id),
                tracks: doc.tracks.filter((t) => t.attr?.specId !== action.id),
                assignments: doc.assignments.filter((a) => !trackIds.includes(a.trackId)),
            };
        }
        case 'ADD_TRACK': {
            const track: Track = { kind: 'track', id: uid('t'), name: action.name, attr: { specId: action.specId } };
            return { ...doc, tracks: [...doc.tracks, track] };
        }
        case 'REMOVE_TRACK':
            return {
                ...doc,
                tracks: doc.tracks.filter((t) => t.id !== action.id),
                assignments: doc.assignments.filter((a) => a.trackId !== action.id),
            };
        case 'SET_CELL':
            return { ...doc, assignments: upsertCell(doc, action.pos, action.patch) };
        case 'CLEAR_CELLS': {
            const keys = new Set(action.cells.map((p) => `${p.trackId}:${p.dayIndex}:${p.slotIndex}`));
            return { ...doc, assignments: doc.assignments.filter((a) => !keys.has(`${a.trackId}:${a.dayIndex}:${a.slotIndex}`)) };
        }
        case 'PASTE': {
            let next = doc;
            action.block.forEach((row, r) => {
                row.forEach((cell, cCol) => {
                    const pos: CellPos = { trackId: action.trackId, slotIndex: action.top + r, dayIndex: action.left + cCol };
                    // 붙여넣기는 칸을 통째로 대체: 먼저 비우고 값이 있으면 채운다
                    const patch = { agentId: cell?.agentId, activityId: cell?.activityId, resourceId: cell?.resourceId };
                    next = { ...next, assignments: upsertCell(next, pos, patch) };
                });
            });
            return next;
        }
        case 'ADD_RULE':
            return { ...doc, rules: [...doc.rules, action.rule] };
        case 'UPDATE_RULE':
            return { ...doc, rules: doc.rules.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)) };
        case 'REMOVE_RULE':
            return { ...doc, rules: doc.rules.filter((r) => r.id !== action.id) };
        case 'ADD_BLACKOUT':
            return { ...doc, blackouts: [...doc.blackouts, action.blackout] };
        case 'REMOVE_BLACKOUT':
            return { ...doc, blackouts: doc.blackouts.filter((b) => b.id !== action.id) };
        default:
            return doc;
    }
}

// ── 되돌리기/다시하기 이력 래퍼 ───────────────────────────────
interface History { past: Doc[]; present: Doc; future: Doc[]; }
type HistoryAction = DocAction | { type: 'UNDO' } | { type: 'REDO' };

function historyReducer(state: History, action: HistoryAction): History {
    if (action.type === 'UNDO') {
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1];
        return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
    }
    if (action.type === 'REDO') {
        if (state.future.length === 0) return state;
        const next = state.future[0];
        return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
    }
    const present = docReducer(state.present, action);
    if (present === state.present) return state; // 변화 없으면 이력 안 쌓음
    return { past: [...state.past, state.present], present, future: [] };
}

const initialDoc: Doc = {
    agents: AGENTS, activities: ACTIVITIES, resources: RESOURCES,
    specs: SPECS, tracks: TRACKS, timetables: TIMETABLES,
    assignments: buildSeedAssignments(), blackouts: BLACKOUTS, rules: [],
};

// ── 화면 상태(UI) — 이력에 안 쌓이는 것들 ─────────────────────
export type LeftTab = 'timetable' | 'agents' | 'activities' | 'resources';
export type Overlay = 'none' | 'combined' | 'blackout';
export interface Selection { trackId: string; r1: number; c1: number; r2: number; c2: number; }

export interface UIState {
    leftTab: LeftTab;
    selectedTrackId: string | null;
    collapsedSpecs: string[];
    selection: Selection | null;
    clipboard: BlockCell[][] | null;
    liveValidation: boolean;
    overlay: Overlay;
}

// ── 컨텍스트 ──────────────────────────────────────────────────
interface StoreValue {
    doc: Doc;
    dispatch: (a: DocAction) => void;
    undo: () => void; redo: () => void;
    canUndo: boolean; canRedo: boolean;
    conflicts: ReturnType<typeof runValidation>;
    ui: UIState;
    setUI: (patch: Partial<UIState>) => void;
}
const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
    const [history, hDispatch] = useReducer(historyReducer, { past: [], present: initialDoc, future: [] });
    const [ui, setUIState] = useState<UIState>({
        leftTab: 'timetable', selectedTrackId: 't-3-1', collapsedSpecs: [],
        selection: null, clipboard: null, liveValidation: true, overlay: 'none',
    });

    const doc = history.present;
    const conflicts = useMemo(() => (ui.liveValidation ? runValidation(doc) : []), [doc, ui.liveValidation]);
    const setUI = useCallback((patch: Partial<UIState>) => setUIState((s) => ({ ...s, ...patch })), []);
    const dispatch = useCallback((a: DocAction) => hDispatch(a), []);

    const value: StoreValue = {
        doc, dispatch,
        undo: () => hDispatch({ type: 'UNDO' }),
        redo: () => hDispatch({ type: 'REDO' }),
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
        conflicts, ui, setUI,
    };
    return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
    const v = useContext(StoreContext);
    if (!v) throw new Error('useStore must be used within StoreProvider');
    return v;
}
