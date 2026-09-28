/**
 * Doc — 파일 하나에 저장되는 '학교 하나의 세계' 전부.
 * 저장 형식은 이 객체를 JSON.stringify 한 것이다 (.shiftgrid.json).
 * 화면·엔진은 전부 이 하나를 읽고, 바꿀 땐 새 Doc을 만든다(불변).
 */
import type {
    Agent, Activity, Resource, Track, Assignment, Blackout, WeeklyBlock,
    ConflictRule, TimetableSpec, Timetable, Demand, Board, SchoolMeta,
} from './schema';
import { HOMEROOM_AGENT_ID } from './schema';

export interface Doc {
    meta: SchoolMeta;
    agents: Agent[];
    activities: Activity[];
    resources: Resource[];
    specs: TimetableSpec[];
    tracks: Track[];
    timetables: Timetable[];
    demands: Demand[];
    assignments: Assignment[];
    blackouts: Blackout[];
    weeklyBlocks: WeeklyBlock[];
    rules: ConflictRule[];
    boards: Board[];
}

/** 빈 학교 — 새 파일을 만들 때의 출발점 */
export function emptyDoc(name = '새 학교', term = ''): Doc {
    return {
        meta: { name, term, schemaVersion: 3 },
        agents: [], activities: [], resources: [], specs: [], tracks: [], timetables: [],
        demands: [], assignments: [], blackouts: [], weeklyBlocks: [], rules: [], boards: [],
    };
}

/**
 * 옛 파일(v1: meta 없음, track.attr.specId, demands 없음 · v2: 담임이 사람)을 v3로 올린다.
 * 모르는 모양이 오면 던지지 말고 빈 배열로 채운다 — 파일 하나 때문에 앱이 안 열리면 안 된다.
 * 멱등이다 — 이미 v3면 아래 단계가 아무것도 바꾸지 않는다.
 */
export function migrateDoc(raw: any): Doc {
    const base = emptyDoc();
    if (!raw || typeof raw !== 'object') return base;
    const arr = (k: keyof Doc) => (Array.isArray(raw[k]) ? raw[k] : []);
    const v2: Doc = {
        // v1 → v2 정규화 (meta·track.specId·track.grade)
        meta: raw.meta && typeof raw.meta === 'object'
            ? { ...base.meta, ...raw.meta }
            : base.meta,
        agents: arr('agents'),
        activities: arr('activities'),
        resources: arr('resources'),
        specs: arr('specs'),
        tracks: (arr('tracks') as Track[]).map((t) => ({
            ...t,
            specId: t.specId ?? (t.attr?.specId as string | undefined),
            grade: t.grade ?? (typeof t.attr?.grade === 'number' ? t.attr.grade : undefined),
        })),
        timetables: arr('timetables'),
        demands: arr('demands'),
        assignments: arr('assignments'),
        blackouts: arr('blackouts'),
        weeklyBlocks: arr('weeklyBlocks'),
        rules: arr('rules'),
        boards: arr('boards'),
    };
    return migrateV2toV3(v2);
}

/**
 * v2 → v3 — 담임을 사람에서 반의 속성으로 옮긴다.
 *   1. role '담임' 인 사람: 그를 가리키는 수요가 없으면 지우고 담임반 homeroomName 에 이름을 적는다(이미 있으면 안 덮음).
 *      수요가 있으면 role '담임 겸 전담', homeroomTrackIds=[담임반] 으로 남긴다.
 *   2. 지운 사람을 가리키던 수요·배치의 agentId → HOMEROOM_AGENT_ID.
 *   3. 모든 사람: homeroomTrackId → homeroomTrackIds 로 옮기고 옛 필드를 지운다.
 *   4. 교사·특별실 대상 금지칸의 slotIndex → 표시 틀(슬롯이 가장 많은 틀) 기준 시각(from/to). 반 대상은 그대로.
 *   5. meta.schemaVersion = 3.
 */
function migrateV2toV3(doc: Doc): Doc {
    // 어떤 사람이 수요(agentId·coAgentId)에서 참조되나
    const referenced = new Set<string>();
    for (const d of doc.demands) {
        if (d.agentId) referenced.add(d.agentId);
        if (d.coAgentId) referenced.add(d.coAgentId);
    }

    const tracks = doc.tracks.map((t) => ({ ...t }));
    const trackById = new Map(tracks.map((t) => [t.id, t]));
    const removed = new Set<string>();
    const agents: Agent[] = [];
    for (const a of doc.agents) {
        const htid = a.homeroomTrackId ?? a.homeroomTrackIds?.[0];
        if (a.role === '담임') {
            if (referenced.has(a.id)) {
                // 담임 겸 전담으로 남긴다
                const na: Agent = { ...a, role: '담임 겸 전담', homeroomTrackIds: htid ? [htid] : (a.homeroomTrackIds ?? []) };
                delete na.homeroomTrackId;
                agents.push(na);
            } else {
                // 사람을 지우고 이름을 반에 적는다
                removed.add(a.id);
                if (htid) { const t = trackById.get(htid); if (t && !t.homeroomName) t.homeroomName = a.name; }
            }
        } else {
            const na: Agent = { ...a };
            if (na.homeroomTrackId && !na.homeroomTrackIds) na.homeroomTrackIds = [na.homeroomTrackId];
            delete na.homeroomTrackId;
            agents.push(na);
        }
    }

    const demands: Demand[] = doc.demands.map((d) => {
        let nd = d;
        if (d.agentId && removed.has(d.agentId)) nd = { ...nd, agentId: HOMEROOM_AGENT_ID };
        if (nd.coAgentId && removed.has(nd.coAgentId)) nd = { ...nd, coAgentId: HOMEROOM_AGENT_ID };
        return nd;
    });
    const assignments: Assignment[] = doc.assignments.map((a) => {
        let na = a;
        if (a.agentId && removed.has(a.agentId)) na = { ...na, agentId: HOMEROOM_AGENT_ID };
        if (na.coAgentId && removed.has(na.coAgentId)) na = { ...na, coAgentId: HOMEROOM_AGENT_ID };
        return na;
    });

    // 표시 틀 = 슬롯이 가장 많은 틀
    let displaySpec: TimetableSpec | undefined;
    for (const s of doc.specs) if (!displaySpec || s.slots.length > displaySpec.slots.length) displaySpec = s;
    const weeklyBlocks: WeeklyBlock[] = doc.weeklyBlocks.map((wb) => {
        if (wb.slotIndex == null) return wb;                                   // 이미 시각/종일
        if (wb.targets.length === 0) return wb;                                // 전체(반 성격) — 그대로
        if (!wb.targets.every((t) => t.kind === 'agent' || t.kind === 'resource')) return wb; // 반 대상 — 그대로
        const slot = displaySpec?.slots.find((s) => s.index === wb.slotIndex);
        if (!slot) return wb;                                                  // 표시 틀에 그 슬롯이 없음 — 정보 보존(그대로)
        const nwb: WeeklyBlock = { ...wb, from: slot.start, to: slot.end };
        delete nwb.slotIndex;
        return nwb;
    });

    return { ...doc, meta: { ...doc.meta, schemaVersion: 3 }, agents, tracks, demands, assignments, weeklyBlocks };
}
