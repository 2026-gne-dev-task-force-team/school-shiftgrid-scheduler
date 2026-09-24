/**
 * doc-ops — Doc 을 받아 '새 Doc' 을 돌려주는 순수 변환들.
 * ⛔ 여기서는 React·엔진·파일을 모른다. Doc 은 불변이라 항상 새 객체를 만든다.
 * store 가 이 함수들을 이력(undo)·자동저장에 얹는다.
 */
import type { Doc } from '../types/doc';
import type {
    Agent, Activity, Resource, Track, Assignment, WeeklyBlock, Blackout,
    ConflictRule, Demand, SchoolMeta, Board, TargetRef, RuleParams,
} from '../types/schema';
import { uid, nowIso } from './ids';

/** 새 항목에 돌려가며 주는 색 (뜻색 아님 — 구분용 장식은 뜻색 셋 밖에서만) */
export const ENTITY_PALETTE = [
    '#5b8def', '#6f7bd6', '#7b9acc', '#8a86c9', '#5aa0c4',
    '#9d7cc4', '#c58fb0', '#6fb0a6', '#8f9bb3', '#c0a05a',
];
export function colorFor(n: number): string {
    return ENTITY_PALETTE[n % ENTITY_PALETTE.length];
}

// ── 메타 ──────────────────────────────────────────────────────
export const setMeta = (d: Doc, patch: Partial<SchoolMeta>): Doc =>
    ({ ...d, meta: { ...d.meta, ...patch, schemaVersion: 2, updatedAt: nowIso() } });

// ── 엔티티 (교사·과목·특별실) ─────────────────────────────────
export function addAgent(d: Doc, name: string, extra?: Partial<Agent>): Doc {
    const a: Agent = { kind: 'agent', id: uid('a'), name, attr: { color: colorFor(d.agents.length) }, ...extra };
    return { ...d, agents: [...d.agents, a] };
}
export const updateAgent = (d: Doc, id: string, patch: Partial<Agent>): Doc =>
    ({ ...d, agents: d.agents.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
export const removeAgent = (d: Doc, id: string): Doc => ({
    ...d,
    agents: d.agents.filter((x) => x.id !== id),
    demands: d.demands.filter((dm) => dm.agentId !== id),
    assignments: d.assignments.map((a) => (a.agentId === id ? { ...a, agentId: undefined } : a)),
});

export function addActivity(d: Doc, name: string): Doc {
    const a: Activity = { kind: 'activity', id: uid('act'), name, attr: { color: colorFor(d.activities.length) } };
    return { ...d, activities: [...d.activities, a] };
}
export const updateActivity = (d: Doc, id: string, patch: Partial<Activity>): Doc =>
    ({ ...d, activities: d.activities.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
export const removeActivity = (d: Doc, id: string): Doc =>
    ({ ...d, activities: d.activities.filter((x) => x.id !== id) });

export function addResource(d: Doc, name: string, extra?: Partial<Resource>): Doc {
    const r: Resource = { kind: 'resource', id: uid('r'), name, capacity: 1, attr: { color: colorFor(d.resources.length) }, ...extra };
    return { ...d, resources: [...d.resources, r] };
}
export const updateResource = (d: Doc, id: string, patch: Partial<Resource>): Doc =>
    ({ ...d, resources: d.resources.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
export const removeResource = (d: Doc, id: string): Doc =>
    ({ ...d, resources: d.resources.filter((x) => x.id !== id) });

// ── 규격 · 반 ─────────────────────────────────────────────────
/** makeSpec 로 만든 규격을 그대로 넣고, 그 규격을 기간에 적용한 기본표도 함께 만든다 */
export function addSpec(d: Doc, spec: import('../types/schema').TimetableSpec): Doc {
    const base = {
        id: uid('tt'), name: `${spec.name} 기본표`, specId: spec.id,
        startDate: '2026-03-02', endDate: '2027-02-28', priority: 0,
    };
    return { ...d, specs: [...d.specs, spec], timetables: [...d.timetables, base] };
}
export const removeSpec = (d: Doc, id: string): Doc => {
    const trackIds = new Set(d.tracks.filter((t) => t.specId === id).map((t) => t.id));
    return {
        ...d,
        specs: d.specs.filter((s) => s.id !== id),
        timetables: d.timetables.filter((tt) => tt.specId !== id),
        tracks: d.tracks.filter((t) => t.specId !== id),
        assignments: d.assignments.filter((a) => !trackIds.has(a.trackId)),
        demands: d.demands.filter((dm) => !trackIds.has(dm.trackId)),
    };
};

export function addTrack(d: Doc, name: string, specId: string, grade?: number): Doc {
    const t: Track = { kind: 'track', id: uid('t'), name, specId, grade };
    return { ...d, tracks: [...d.tracks, t] };
}
export const updateTrack = (d: Doc, id: string, patch: Partial<Track>): Doc =>
    ({ ...d, tracks: d.tracks.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
export const removeTrack = (d: Doc, id: string): Doc => ({
    ...d,
    tracks: d.tracks.filter((t) => t.id !== id),
    assignments: d.assignments.filter((a) => a.trackId !== id),
    demands: d.demands.filter((dm) => dm.trackId !== id),
});

// ── 수요 (시수표) ─────────────────────────────────────────────
export function addDemand(d: Doc, dm: Omit<Demand, 'id'>): Doc {
    return { ...d, demands: [...d.demands, { ...dm, id: uid('dm') }] };
}
/** 반 여러 개에 같은 규격의 수요를 한 번에 */
export function addDemandsBulk(d: Doc, base: Omit<Demand, 'id' | 'trackId'>, trackIds: string[]): Doc {
    const add = trackIds.map((trackId) => ({ ...base, trackId, id: uid('dm') }));
    return { ...d, demands: [...d.demands, ...add] };
}
export const updateDemand = (d: Doc, id: string, patch: Partial<Demand>): Doc =>
    ({ ...d, demands: d.demands.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
export const removeDemand = (d: Doc, id: string): Doc =>
    ({ ...d, demands: d.demands.filter((x) => x.id !== id) });
export function duplicateDemand(d: Doc, id: string): Doc {
    const src = d.demands.find((x) => x.id === id);
    if (!src) return d;
    return { ...d, demands: [...d.demands, { ...src, id: uid('dm') }] };
}

// ── 주간 금지칸 (배정금지·회피·임시금지) ──────────────────────
export type BlockState = 'none' | 'ban' | 'avoid' | 'temp';

export function blockStateAt(d: Doc, target: TargetRef, dayIndex: number, slotIndex: number): BlockState {
    const wb = findBlock(d, target, dayIndex, slotIndex);
    if (!wb) return 'none';
    if (wb.temp) return 'temp';
    if (wb.soft) return 'avoid';
    return 'ban';
}
function findBlock(d: Doc, target: TargetRef, dayIndex: number, slotIndex: number): WeeklyBlock | undefined {
    return d.weeklyBlocks.find((wb) =>
        wb.dayIndex === dayIndex && wb.slotIndex === slotIndex &&
        wb.targets.length === 1 && wb.targets[0].id === target.id && wb.targets[0].kind === target.kind);
}
const BLOCK_NAME: Record<Exclude<BlockState, 'none'>, string> = { ban: '배정금지', avoid: '회피', temp: '임시금지' };

export function setBlockState(d: Doc, target: TargetRef, dayIndex: number, slotIndex: number, state: BlockState): Doc {
    const existing = findBlock(d, target, dayIndex, slotIndex);
    const rest = existing ? d.weeklyBlocks.filter((wb) => wb.id !== existing.id) : d.weeklyBlocks;
    if (state === 'none') return { ...d, weeklyBlocks: rest };
    const wb: WeeklyBlock = {
        id: uid('wb'), name: BLOCK_NAME[state], dayIndex, slotIndex,
        targets: [target], soft: state === 'avoid', temp: state === 'temp',
    };
    return { ...d, weeklyBlocks: [...rest, wb] };
}
/** 없음 → 배정금지 → 회피 → 임시금지 → 없음 */
export function cycleBlock(d: Doc, target: TargetRef, dayIndex: number, slotIndex: number): Doc {
    const order: BlockState[] = ['none', 'ban', 'avoid', 'temp'];
    const cur = blockStateAt(d, target, dayIndex, slotIndex);
    const next = order[(order.indexOf(cur) + 1) % order.length];
    return setBlockState(d, target, dayIndex, slotIndex, next);
}
export const clearTempBlocks = (d: Doc): Doc =>
    ({ ...d, weeklyBlocks: d.weeklyBlocks.filter((wb) => !wb.temp) });

export const addBlackout = (d: Doc, b: Omit<Blackout, 'id'>): Doc =>
    ({ ...d, blackouts: [...d.blackouts, { ...b, id: uid('bo') }] });
export const removeBlackout = (d: Doc, id: string): Doc =>
    ({ ...d, blackouts: d.blackouts.filter((x) => x.id !== id) });

// ── 배치 (칸 채우기·비우기·잠금·고정) ─────────────────────────
function baseTimetableFor(d: Doc, track: Track): string {
    return d.timetables.find((tt) => tt.specId === track.specId)?.id ?? d.timetables[0]?.id ?? '';
}
function isEmptyCell(a: Assignment): boolean {
    return !a.agentId && !a.activityId && !a.resourceId && !a.label;
}
export interface CellPos { trackId: string; dayIndex: number; slotIndex: number; }

export function setCell(d: Doc, pos: CellPos, patch: Partial<Assignment>): Doc {
    const list = d.assignments.slice();
    const idx = list.findIndex((a) => a.trackId === pos.trackId && a.dayIndex === pos.dayIndex && a.slotIndex === pos.slotIndex);
    if (idx >= 0) {
        const merged = { ...list[idx], ...patch };
        if (isEmptyCell(merged)) list.splice(idx, 1);
        else list[idx] = merged;
    } else {
        const track = d.tracks.find((t) => t.id === pos.trackId);
        if (!track) return d;
        const na: Assignment = {
            kind: 'work', id: uid('w'), timetableId: baseTimetableFor(d, track),
            trackId: pos.trackId, dayIndex: pos.dayIndex, slotIndex: pos.slotIndex, ...patch,
        };
        if (!isEmptyCell(na)) list.push(na);
    }
    return { ...d, assignments: list };
}
export function clearCell(d: Doc, pos: CellPos): Doc {
    return {
        ...d,
        assignments: d.assignments.filter((a) =>
            !(a.trackId === pos.trackId && a.dayIndex === pos.dayIndex && a.slotIndex === pos.slotIndex)),
    };
}
export function addFixed(d: Doc, pos: CellPos, activityId: string | undefined, label: string): Doc {
    return setCell(d, pos, { activityId, label, fixed: true });
}
export function togglePinAt(d: Doc, id: string): Doc {
    return { ...d, assignments: d.assignments.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a)) };
}
export function toggleTempAt(d: Doc, id: string): Doc {
    return { ...d, assignments: d.assignments.map((a) => (a.id === id ? { ...a, temp: !a.temp } : a)) };
}

// ── 솔버 결과 적용 ────────────────────────────────────────────
export const applyAssignments = (d: Doc, assignments: Assignment[]): Doc =>
    ({ ...d, assignments });

// ── 엑셀 불러오기 반영 (사람이 누르면 이 조각들을 doc 에 합친다) ──
export function mergeImport(d: Doc, r: {
    agents: Agent[]; tracks: Track[]; activities: Activity[]; demands: Demand[];
}): Doc {
    const has = <T extends { id: string }>(list: T[], id: string) => list.some((x) => x.id === id);
    return {
        ...d,
        agents: [...d.agents, ...r.agents.filter((x) => !has(d.agents, x.id))],
        tracks: [...d.tracks, ...r.tracks.filter((x) => !has(d.tracks, x.id))],
        activities: [...d.activities, ...r.activities.filter((x) => !has(d.activities, x.id))],
        demands: [...d.demands, ...r.demands.filter((x) => !has(d.demands, x.id))],
    };
}

// ── 엑셀식 시트 배치 반영 (한 번 = 한 undo) ───────────────────
//  시트가 통째로 만든 목록을 doc 에 앉히고, 사라진 것이 남긴 참조는 정리한다.

/** 반 목록을 통째로 교체. 없어진 반의 배치·수요는 함께 지운다 */
export function syncTracks(d: Doc, tracks: Track[]): Doc {
    const keep = new Set(tracks.map((t) => t.id));
    return {
        ...d,
        tracks,
        assignments: d.assignments.filter((a) => keep.has(a.trackId)),
        demands: d.demands.filter((dm) => keep.has(dm.trackId)),
    };
}
/** 교사 목록 교체. 없어진 교사의 수요는 지우고, 배치에선 교사만 뗀다 */
export function syncAgents(d: Doc, agents: Agent[]): Doc {
    const keep = new Set(agents.map((a) => a.id));
    return {
        ...d,
        agents,
        demands: d.demands.filter((dm) => keep.has(dm.agentId)),
        assignments: d.assignments.map((a) => (a.agentId && !keep.has(a.agentId) ? { ...a, agentId: undefined } : a)),
    };
}
/** 과목 목록 교체. 없어진 과목의 수요는 지우고, 특별실·배치의 참조는 정리한다 */
export function syncActivities(d: Doc, activities: Activity[]): Doc {
    const keep = new Set(activities.map((a) => a.id));
    return {
        ...d,
        activities,
        demands: d.demands.filter((dm) => keep.has(dm.activityId)),
        resources: d.resources.map((r) => (r.activityIds ? { ...r, activityIds: r.activityIds.filter((id) => keep.has(id)) } : r)),
        assignments: d.assignments.map((a) => (a.activityId && !keep.has(a.activityId) ? { ...a, activityId: undefined } : a)),
    };
}
/** 특별실 목록 교체. 없어진 특별실을 쓰던 수요·배치의 참조는 정리한다 */
export function syncResources(d: Doc, resources: Resource[]): Doc {
    const keep = new Set(resources.map((r) => r.id));
    return {
        ...d,
        resources,
        demands: d.demands.map((dm) => (dm.resourceId && !keep.has(dm.resourceId) ? { ...dm, resourceId: undefined, roomHours: undefined } : dm)),
        assignments: d.assignments.map((a) => (a.resourceId && !keep.has(a.resourceId) ? { ...a, resourceId: undefined } : a)),
    };
}

/** 시수표 시트 반영 — 새로 생긴 교사·과목·반을 들이고, 수요는 통째로 갈아끼운다 */
export function applyDemandSheet(d: Doc, p: {
    newAgents: Agent[]; newActivities: Activity[]; newTracks: Track[]; demands: Demand[];
}): Doc {
    const has = <T extends { id: string }>(list: T[], id: string) => list.some((x) => x.id === id);
    return {
        ...d,
        agents: [...d.agents, ...p.newAgents.filter((x) => !has(d.agents, x.id))],
        activities: [...d.activities, ...p.newActivities.filter((x) => !has(d.activities, x.id))],
        tracks: [...d.tracks, ...p.newTracks.filter((x) => !has(d.tracks, x.id))],
        demands: p.demands,
    };
}

/** 학년별 반 수로 반을 한 번에 만든다 — 이미 있는 (학년,반)은 건너뛴다 */
export function makeTracksByGrade(d: Doc, counts: Record<number, number>, specId: string): Doc {
    const add: Track[] = [];
    for (const [gStr, n] of Object.entries(counts)) {
        const grade = Number(gStr);
        for (let cls = 1; cls <= n; cls++) {
            const exists = d.tracks.some((t) => t.grade === grade && ((t.attr?.classNum as number | undefined) === cls || t.name === `${grade}-${cls}`));
            if (exists) continue;
            const sibling = d.tracks.find((t) => t.grade === grade);
            add.push({ kind: 'track', id: uid('t'), name: `${grade}-${cls}`, grade, specId: sibling?.specId ?? specId, attr: { classNum: cls } });
        }
    }
    return add.length ? { ...d, tracks: [...d.tracks, ...add] } : d;
}

// ── 규칙 ──────────────────────────────────────────────────────
export const setRules = (d: Doc, rules: ConflictRule[]): Doc => ({ ...d, rules });
export const toggleRule = (d: Doc, id: string): Doc =>
    ({ ...d, rules: d.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) });
export const updateRuleParams = (d: Doc, id: string, params: RuleParams): Doc =>
    ({ ...d, rules: d.rules.map((r) => (r.id === id ? { ...r, params: { ...r.params, ...params } } : r)) });

// ── 판 (Board) ────────────────────────────────────────────────
const MAX_AUTO = 30;
function pushBoard(d: Doc, board: Board): Doc {
    const boards = [...d.boards, board];
    const autos = boards.filter((b) => b.auto);
    if (autos.length > MAX_AUTO) {
        const drop = new Set(autos.slice(0, autos.length - MAX_AUTO).map((b) => b.id));
        return { ...d, boards: boards.filter((b) => !drop.has(b.id)) };
    }
    return { ...d, boards };
}
export function saveBoard(d: Doc, name: string, score?: { hard: number; soft: number }): Doc {
    return pushBoard(d, {
        id: uid('bd'), name, createdAt: nowIso(),
        assignments: d.assignments.map((a) => ({ ...a })), auto: false, score,
    });
}
/** 큰 변경(솔버 적용·자동조정·판 복원)마다 자동 스냅샷을 쌓는다 */
export function autoSnapshot(d: Doc, label: string, score?: { hard: number; soft: number }): Doc {
    return pushBoard(d, {
        id: uid('bd'), name: label, createdAt: nowIso(),
        assignments: d.assignments.map((a) => ({ ...a })), auto: true, score,
    });
}
export function restoreBoard(d: Doc, id: string): Doc {
    const b = d.boards.find((x) => x.id === id);
    if (!b) return d;
    return { ...d, assignments: b.assignments.map((a) => ({ ...a })) };
}
export const publishBoard = (d: Doc, id: string): Doc =>
    ({ ...d, boards: d.boards.map((b) => ({ ...b, published: b.id === id })) });
export const deleteBoard = (d: Doc, id: string): Doc =>
    ({ ...d, boards: d.boards.filter((b) => b.id !== id) });
