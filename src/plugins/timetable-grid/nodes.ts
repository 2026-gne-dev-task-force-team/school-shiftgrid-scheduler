/**
 * 시간표 그리드 ↔ 노드 시스템 다리 — 🔴 시간표 한 장이 노드다. 저장·휴지통·복원은 노드 시스템이 쥔다
 *   (달력·명단 다리와 같은 규칙). ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만.
 *
 * 이 모듈이 쥐는 것:
 *   ① 노드 타입 등록(timetable-grid.sheet 컨테이너) — index.ts 가 contributes 로 꽂는다
 *   ② NodesApi 참조 + byType 스냅샷(시간표)을 subscribe 로 갱신 — 뷰가 useSyncExternalStore 로 읽는다
 *   ③ 시간표 데이터 읽기·쓰기(손 편집 전부 model.ts 순수 함수로 돌린 뒤 setData) · 표 통째 복사(노드 복제)
 *   ④ 일정 목록 계산(schedule.ts)
 */
// 🔴 import type 만 — 약속 타입은 약속 플러그인에서(값 아님, 구조 검사 ⑱·d·g). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { TimetableData, ScheduleEntry } from './types';
import { createUndoSlot, type Disposable, type MenuEntry, type PluginHost, type NodeTypeContribution } from '../../pane-ui-system/plugin';
import { blankTimetable, guardTimeline, normalizeTimetable } from './model';
import { scheduleRange } from './schedule';
import { setActiveSheet } from './store';

export const SHEET_TYPE = 'timetable-grid.sheet';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'timetable-grid.' 를 붙인다). 시간표를 열면 여는 그리드 화면.
const GRID_ID = 'timetable-grid.grid';

// ── 다리 상태(모듈 전역 — 달력·명단 nodes.ts 와 같은 결) ──
let api: NodesApi | null = null;
let sheetNodes: PublicNode[] = [];
const subs = new Set<() => void>();

let seen: Set<string> | null = null;
function recompute(): void {
    sheetNodes = api ? api.byType(SHEET_TYPE) : [];
    // 🔑 첫 계산 뒤에 새로 생긴 시간표(탐색기 「새로 만들기」 포함)는 처음 열릴 때 격자 첫 칸에 초점 — createSheet 만 지나는 게 아니다
    if (seen) for (const n of sheetNodes) if (!seen.has(n.id)) fresh.add(n.id);
    seen = new Set(sheetNodes.map((n) => n.id));
    for (const s of subs) s();
}

/**
 * 🔴 노드 타입 함수 묶음(선언형 D5) — contributes.nodeTypes 의 impl 이름이 가리킨다.
 *   · sheet.open  — 시간표를 열면 「보고 있는 시간표」를 그걸로 두고 그리드 화면을 가운데에.
 */
export const gridNodeTypeImpl = {
    sheet: {
        open: (host: PluginHost, id: string) => { setActiveSheet(id); host.workspace.open(GRID_ID, { where: 'center' }); },
        menu: (_host: PluginHost, id: string) => sheetMenu(id),
    } satisfies NodeTypeImplFns,
};

/**
 * 타입 하나 — 시간표(컨테이너: 폴더·시간표를 받음). 탐색기에 보인다.
 */
export const gridNodeTypes: NodeTypeContribution<'sheet'>[] = [
    {
        type: SHEET_TYPE, body: 'sheet', label: '시간표', icon: 'schedule',
        container: { accepts: ['folder', SHEET_TYPE] }, openable: true,
        create: { label: '시간표', under: ['folder', SHEET_TYPE] },
        impl: 'sheet',
    },
];

export function sheetMenu(nodeId: string): MenuEntry[] {
    // 🔴 대상은 항목의 commandArg.nodeId 로 명령에 실린다(CommandContext.nodeId) — 모듈 전역에 안 쥔다.
    const commandArg = { nodeId };
    return [
        { label: '시간표 열기', icon: 'schedule', commandId: 'timetable-grid.openSheet', commandArg },
        { label: '표 복사(통째)', icon: 'copy', commandId: 'timetable-grid.duplicate', commandArg },
    ];
}

/** 활성(index.ts)이 한 번 — NodesApi 를 쥐고 구독을 건다. */
export function initGridNodes(nodes: NodesApi | null, host?: PluginHost): Disposable | null {
    api = nodes; hostRef = host ?? null;
    recompute();
    if (!nodes) return null;
    return nodes.subscribe(() => recompute());
}

export function getNodesApi(): NodesApi | null { return api; }

// ── React 구독 창구 ──
export function subscribeNodes(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getSheetNodes(): PublicNode[] { return sheetNodes; }

/**
 * 시작 화면 「새 시간표」 — 탐색기 맨 위(main 루트)에 빈 시간표 한 장을 만든다. 이름이 겹치면 「시간표 2」…
 *   데이터는 비워 둔다(sheetDataOf 가 기본 월~금 × 6행을 깐다 — 탐색기 「새로 만들기」와 같은 결). 새 id 를 돌려준다.
 */
export function createSheet(): string | null {
    if (!api) return null;
    const taken = new Set(sheetNodes.map((n) => n.name));
    let name = '시간표';
    for (let i = 2; taken.has(name); i++) name = `시간표 ${i}`;
    const id = api.create(api.roots.main, { type: SHEET_TYPE, name });
    if (id) fresh.add(id);
    return id;
}
/** 방금 만든 시간표 — 처음 열릴 때 격자 첫 칸에 초점을 준다(한 번). */
const fresh = new Set<string>();
export const isFresh = (id: string): boolean => fresh.has(id);
export const takeFresh = (id: string): void => { fresh.delete(id); };

/** 노드가 든 폴더 이름(맨 위면 null) — 시작 화면 목록의 꼬리표. */
export function parentNameOf(id: string): string | null {
    if (!api) return null;
    const p = api.parent(id);
    if (!p || p === api.roots.main) return null;
    return api.get(p)?.name ?? null;
}

/** 휴지통 안인가 — 노드 시스템의 정식 판정(nodes.isTrashed). */
export function inTrash(id: string): boolean { return api?.isTrashed(id) ?? false; }

// ── 데이터 읽기 ──

/** 시간표 노드인가. */
export function isSheet(id: string): boolean { return api?.get(id)?.type === SHEET_TYPE; }

/** 읽기 변환 캐시 — 같은 저장 객체엔 같은 결과(useSyncExternalStore 스냅샷이 흔들리지 않게). */
const normalized = new WeakMap<object, TimetableData>();

/** 시간표 데이터 — 없으면 빈 표(결정적). 🔴 W10a: 옛 자료(쉬는 시간 행·겹친 행)는 읽을 때 갭·밀림으로 고쳐 준다. */
export function sheetDataOf(id: string): TimetableData {
    const raw = api?.get(id)?.data as TimetableData | undefined;
    if (!raw) return blankTimetable();
    let out = normalized.get(raw);
    if (!out) { out = normalizeTimetable(raw); normalized.set(raw, out); }
    return out;
}

// ── 쓰기 ──

/** 데이터 한 장을 순수 함수로 바꿔 저장한다 — 손 편집 전부 이 길. */
export function applyEdit(id: string, edit: (data: TimetableData) => TimetableData): void {
    if (!api) return;
    const prev = sheetDataOf(id);
    const next = guardTimeline(prev, edit(prev));   // 🔴 겹침 금지 관문 — 모든 손 편집이 지난다
    if (next === prev) return;
    const h = histories.get(id) ?? { past: [], future: [] };
    histories.set(id, { past: [...h.past, { before: prev, after: next }].slice(-HISTORY_LIMIT), future: [] });
    editSeq++;
    api.setData(id, next);
}

// ── 행·열 지우기·병합 해제 되돌리기 알림 — 기존 ⌘Z 더미(stepEdit)로 되돌린다. 뒤에 편집이 쌓이면(editSeq 가 달라짐) 회색.
let hostRef: PluginHost | null = null;
let editSeq = 0;
const removal = createUndoSlot({ commandId: 'timetable-grid.undoRemoved', key: 'timetable-grid.removed' });
export function notifyRemoved(id: string, title: string): void {
    const seq = editSeq;
    if (hostRef) removal.notify(hostRef, title, () => stepEdit(id, 'undo'), () => seq === editSeq);
}
export const removedUndoable = removal.undoable;
export const undoRemoved = removal.undo;

// ⌘Z 더미 — 시간표마다 따로. 저장 안 함(새로고침하면 비워진다).
//   🔴 W-X2 칸 단위 — 한 칸 = 편집 앞뒤 한 쌍(before·after). 되돌리기는 문서 통째를 before 로 바꾸지 않고
//      「이 편집이 바꾼 칸만」 지금 문서 위에서 before 값으로 돌린다 — 그 사이 다른 탭이 고친 칸은 그대로 산다.
interface EditStep { before: TimetableData; after: TimetableData }
interface EditHistory { past: EditStep[]; future: EditStep[] }
const HISTORY_LIMIT = 100;
const histories = new Map<string, EditHistory>();

/** 칸을 쪼개 보는 자리 — 열쇠마다 따로 되돌린다. 나머지(range·columns·rows·view)는 통째 한 칸. */
const KEYED = new Set<string>(['cells', 'colNames', 'colWidths']);

function same(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
    const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * from→to 로 바뀐 칸만 cur 위에 to 값으로 옮긴다(from·to 가 같은 칸은 cur 그대로).
 *   되돌리기 = applyDiff(after, before, 지금) · 다시하기 = applyDiff(before, after, 지금).
 */
export function applyDiff(from: TimetableData, to: TimetableData, cur: TimetableData): TimetableData {
    const out: Record<string, unknown> = { ...cur };
    const f = from as unknown as Record<string, unknown>;
    const t = to as unknown as Record<string, unknown>;
    for (const k of new Set([...Object.keys(f), ...Object.keys(t)])) {
        if (same(f[k], t[k])) continue;
        if (KEYED.has(k)) {
            const fo = (f[k] ?? {}) as Record<string, unknown>;
            const to2 = (t[k] ?? {}) as Record<string, unknown>;
            const next: Record<string, unknown> = { ...((out[k] ?? {}) as Record<string, unknown>) };
            for (const kk of new Set([...Object.keys(fo), ...Object.keys(to2)])) {
                if (same(fo[kk], to2[kk])) continue;
                if (to2[kk] === undefined) delete next[kk]; else next[kk] = to2[kk];
            }
            out[k] = next;
        } else if (t[k] === undefined) delete out[k];
        else out[k] = t[k];
    }
    return out as unknown as TimetableData;
}

/** 되돌리기/다시하기 할 칸이 있나(툴바 단추 끔 판단). */
export function canStep(id: string, which: 'undo' | 'redo'): boolean {
    const h = histories.get(id);
    return !!h && (which === 'undo' ? h.past.length > 0 : h.future.length > 0);
}

/** 창틀 알림 한 줄(정보). */
export function notifyInfo(title: string): void { hostRef?.notify({ title }); }

/** 되돌리기/다시하기 한 칸 — 더미가 비면 아무것도 안 한다. */
export function stepEdit(id: string, which: 'undo' | 'redo'): void {
    const h = histories.get(id);
    if (!h || !api) return;
    const cur = sheetDataOf(id);
    let step: EditStep | undefined;
    let value: TimetableData;
    if (which === 'undo') {
        step = h.past[h.past.length - 1];
        if (!step) return;
        value = applyDiff(step.after, step.before, cur);
        histories.set(id, { past: h.past.slice(0, -1), future: [step, ...h.future] });
    } else {
        step = h.future[0];
        if (!step) return;
        value = applyDiff(step.before, step.after, cur);
        histories.set(id, { past: [...h.past, step], future: h.future.slice(1) });
    }
    editSeq++;
    api.setData(id, guardTimeline(cur, value));
}

/**
 * 🔴 표 통째 복사 — 노드를 복제한다(명세: 칸 복사는 표 편집기 몫, 표 통째 복사는 그리드가 노드 복제로).
 *   같은 부모 밑에 시간표를 복사한다. 새 시간표 id 를 돌려준다.
 */
export function duplicateSheet(id: string): string {
    if (!api || !isSheet(id)) return '';
    const parent = api.parent(id) ?? api.roots.main;
    const src = api.get(id);
    if (!src) return '';
    const newId = api.create(parent, { type: SHEET_TYPE, name: `${src.name} 복사`, data: sheetDataOf(id) });
    if (!newId) return '';
    return newId;
}

// ── 일정 ──

/** 그 시간표가 [from,to] 에 내는 일정 목록 — 🔴 달력으로 갈 재료. */
export function scheduleFor(sheetId: string, from: string, to: string): ScheduleEntry[] {
    return scheduleRange(sheetDataOf(sheetId), from, to);
}
