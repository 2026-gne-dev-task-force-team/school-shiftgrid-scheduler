/**
 * 시수표 접기·펼치기 — 화면(DemandTable)에서 떼어 낸 순수 함수(T-10cp R108). 시험이 DOM 없이 돈다.
 *   fold: Demand[] → 시트 행 · unfold: 시트 행 → Demand[] (덜 채운 줄은 조용히 건너뛴다)
 */
import { uid } from './ids';
import type { Doc } from '../types/doc';
import type { Agent, Activity, Track, Demand } from '../types/schema';
import { HOMEROOM_AGENT_ID, HOMEROOM_LABEL } from '../types/schema';
import type { SheetRow, CellValue } from '../ui/parts/Sheet';

// ── 도우미 ────────────────────────────────────────────────────
export function classNumOf(t: Track | undefined): number {
    if (!t) return 0;
    const c = t.attr?.classNum as number | undefined;
    if (typeof c === 'number') return c;
    const n = Number(t.name.split('-')[1]);
    return Number.isFinite(n) ? n : 0;
}

/** 그 학년에 있는 반 번호(문자열) 목록 */
export function classNumsOfGrade(all: Track[], grade: number): string[] {
    return [...new Set(all.filter((t) => t.grade === grade).map(classNumOf))].filter((n) => n > 0)
        .sort((a, b) => a - b).map(String);
}

/** 셀 값(배열 또는 「1,3,5」·「전체」 문자열)을 반 번호 목록으로 */
export function classNumsOfCell(v: CellValue | undefined, grade: number, all: Track[]): number[] {
    const parts = Array.isArray(v)
        ? v.map((s) => String(s).trim())
        : String(v ?? '').split(',').map((s) => s.trim());
    if (parts.includes('전체')) return classNumsOfGrade(all, grade).map(Number);
    return [...new Set(parts.map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n > 0))];
}

/** 셀 값에 '전체' 가 들어 있나 (옛 값·붙여넣기·엑셀 호환) */
export function cellHasAll(v: CellValue | undefined): boolean {
    const parts = Array.isArray(v)
        ? v.map((s) => String(s).trim())
        : String(v ?? '').split(',').map((s) => s.trim());
    return parts.includes('전체');
}

function parseBlock(s: string): number[] | undefined {
    const nums = s.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length ? nums : undefined;
}

// ── 접기 (Demand[] → 시트 행) ─────────────────────────────────
export function fold(doc: Doc): SheetRow[] {
    const nameOfAgent = (id: string) => (id === HOMEROOM_AGENT_ID ? HOMEROOM_LABEL : doc.agents.find((a) => a.id === id)?.name ?? '');
    const nameOfAct = (id: string) => doc.activities.find((a) => a.id === id)?.name ?? '';
    const nameOfRoom = (id?: string) => (id ? doc.resources.find((r) => r.id === id)?.name ?? '' : '');

    const groups = new Map<string, SheetRow>();
    const classes = new Map<string, Set<number>>();
    for (const dm of doc.demands) {
        const t = doc.tracks.find((x) => x.id === dm.trackId);
        const grade = t?.grade ?? 0;
        const block = (dm.block ?? []).join(',');
        const key = [dm.agentId, dm.coAgentId ?? '', dm.activityId, grade, dm.count, dm.resourceId ?? '', dm.roomHours ?? '', block, dm.cycle ? '1' : ''].join('|');
        if (!groups.has(key)) {
            groups.set(key, {
                _id: `g|${key}`,
                교사: nameOfAgent(dm.agentId), 함께수업: nameOfAgent(dm.coAgentId ?? '') || '',
                과목: nameOfAct(dm.activityId), 학년: grade, 반: [],
                주당시수: dm.count, 특별실: nameOfRoom(dm.resourceId), 특별실사용시수: dm.roomHours ?? '',
                연속수업: block, 차시순서맞춤: !!dm.cycle,
            });
            classes.set(key, new Set());
        }
        classes.get(key)!.add(classNumOf(t));
    }
    const out: SheetRow[] = [...groups.entries()].map(([key, row]) => {
        const cls = [...classes.get(key)!].filter((n) => n > 0).sort((a, b) => a - b).map(String);
        return { ...row, 반: cls };
    });
    out.sort((a, b) => Number(a.학년) - Number(b.학년) || String(a.교사).localeCompare(String(b.교사)) || String(a.과목).localeCompare(String(b.과목)));
    return out;
}

// ── 펼치기 (시트 행 → Demand[] + 새 과목·반) ──────────────────
export function unfold(doc: Doc, rows: SheetRow[]) {
    const agentByName = new Map(doc.agents.map((a) => [a.name, a] as const));
    const actByName = new Map(doc.activities.map((a) => [a.name, a] as const));
    const roomByName = new Map(doc.resources.map((r) => [r.name, r.id] as const));
    const newActivities: Activity[] = [];
    const newTracks: Track[] = [];
    const allTracks = () => [...doc.tracks, ...newTracks];

    const ensureActivity = (name: string): string => {
        const ex = actByName.get(name);
        if (ex) return ex.id;
        const a: Activity = { kind: 'activity', id: uid('act'), name };
        actByName.set(name, a); newActivities.push(a); return a.id;
    };
    const trackOf = (grade: number, cls: number): Track | undefined => {
        const found = allTracks().find((t) => t.grade === grade && classNumOf(t) === cls);
        if (found) return found;
        const sibling = allTracks().find((t) => t.grade === grade);
        if (!sibling) return undefined;   // 규격을 알 수 없어 못 만든다
        const t: Track = { kind: 'track', id: uid('t'), name: `${grade}-${cls}`, grade, specId: sibling.specId, attr: { classNum: cls } };
        newTracks.push(t); return t;
    };

    const existingByKey = new Map<string, string>(doc.demands.map((dm) => [`${dm.agentId}|${dm.trackId}|${dm.activityId}`, dm.id]));
    const demands: Demand[] = [];
    for (const r of rows) {
        const teacher = String(r.교사 ?? '').trim();
        const subject = String(r.과목 ?? '').trim();
        const grade = Number(r.학년);
        const count = Number(r.주당시수);
        if (!teacher || !subject || !Number.isFinite(grade) || grade < 1 || grade > 6 || !Number.isFinite(count) || count <= 0) continue;
        // 교사: 「담임」이거나 교사 탭에 있는 이름만 — 즉석 생성 없음
        const agentId = teacher === HOMEROOM_LABEL ? HOMEROOM_AGENT_ID : agentByName.get(teacher)?.id;
        if (!agentId) continue;
        const classes = classNumsOfCell(r.반, grade, allTracks());
        if (classes.length === 0) continue;
        const activityId = ensureActivity(subject);
        const coName = String(r.함께수업 ?? '').trim();
        const coAgentId = coName === HOMEROOM_LABEL ? HOMEROOM_AGENT_ID : (coName ? agentByName.get(coName)?.id : undefined);
        const roomName = String(r.특별실 ?? '').trim();
        const resourceId = roomName ? roomByName.get(roomName) : undefined;
        const roomHours = resourceId && r.특별실사용시수 !== '' && r.특별실사용시수 != null ? Number(r.특별실사용시수) : undefined;
        const block = parseBlock(String(r.연속수업 ?? ''));
        const cycle = !!r.차시순서맞춤;
        for (const cls of classes) {
            const t = trackOf(grade, cls);
            if (!t) continue;
            const key = `${agentId}|${t.id}|${activityId}`;
            demands.push({
                id: existingByKey.get(key) ?? uid('dm'),
                agentId, coAgentId, trackId: t.id, activityId, count,
                resourceId, roomHours, block, cycle: cycle || undefined,
            });
        }
    }
    return { newAgents: [] as Agent[], newActivities, newTracks, demands };
}
