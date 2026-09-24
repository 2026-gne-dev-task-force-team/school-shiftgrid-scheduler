/**
 * Doc — 파일 하나에 저장되는 '학교 하나의 세계' 전부.
 * 저장 형식은 이 객체를 JSON.stringify 한 것이다 (.shiftgrid.json).
 * 화면·엔진은 전부 이 하나를 읽고, 바꿀 땐 새 Doc을 만든다(불변).
 */
import type {
    Agent, Activity, Resource, Track, Assignment, Blackout, WeeklyBlock,
    ConflictRule, TimetableSpec, Timetable, Demand, Board, SchoolMeta,
} from './schema';

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
        meta: { name, term, schemaVersion: 2 },
        agents: [], activities: [], resources: [], specs: [], tracks: [], timetables: [],
        demands: [], assignments: [], blackouts: [], weeklyBlocks: [], rules: [], boards: [],
    };
}

/**
 * 옛 파일(v1: meta 없음, track.attr.specId, demands 없음)을 v2로 올린다.
 * 모르는 모양이 오면 던지지 말고 빈 배열로 채운다 — 파일 하나 때문에 앱이 안 열리면 안 된다.
 */
export function migrateDoc(raw: any): Doc {
    const d = emptyDoc();
    if (!raw || typeof raw !== 'object') return d;
    const arr = (k: keyof Doc) => (Array.isArray(raw[k]) ? raw[k] : []);
    return {
        meta: raw.meta && typeof raw.meta === 'object'
            ? { ...d.meta, ...raw.meta, schemaVersion: 2 }
            : d.meta,
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
}
