/**
 * 엑셀 입출력 — 교사별 시수표 한 장이 입구다 (컴시간이 그렇게 한다).
 * SheetJS(xlsx)로 구현. 브라우저(웹 빌드)·Electron 렌더러 어디서든 그대로 돈다(파일시스템 안 씀).
 *
 *  ⭐ v0.2: 담임은 사람이 아니라 반의 속성이다(HOMEROOM). 시수표 교사 칸의 「담임」은 HOMEROOM_AGENT_ID 로 읽는다.
 *     「함께 수업」(협력수업)·반 시트의 「담임 이름」·교사 시트를 함께 나른다. 왕복(내려받기→불러오기)이 같은 시수표가 된다.
 *     옛 머리글(반당시수·특별실시수·연강·순배·보조인력)도 읽어 준다(옛 양식 호환).
 */
import * as XLSX from 'xlsx';
import type { Doc } from '../types/doc';
import type { Agent, Track, Activity, Demand } from '../types/schema';
import { HOMEROOM_AGENT_ID, HOMEROOM_LABEL } from '../types/schema';

export interface ImportResult {
    agents: Agent[];       // 새로 생긴 교사 (이미 있으면 안 겹침)
    tracks: Track[];
    activities: Activity[];
    demands: Demand[];
    errors: string[];      // 사람이 읽을 문장. 비어 있으면 성공
}

const SHEET_DEMANDS = '시수표';
const SHEET_TRACKS = '반';
const SHEET_ACTIVITIES = '과목';
const SHEET_RESOURCES = '특별실';
const SHEET_AGENTS = '교사';
const SHEET_GUIDE = '안내';

const DEMAND_HEADER = ['교사', '함께 수업', '과목', '학년', '반', '주당 시수', '특별실', '특별실 사용 시수', '연속 수업', '차시 순서 맞춤'];

// ──────────────────────────────────────────────── 공통 헬퍼

/** 이름 → 안정된(같은 이름이면 항상 같은) ASCII 짧은 슬러그. 한글 로마자 변환 없이 해시만 쓴다 */
function slugOf(...parts: (string | number)[]): string {
    const s = parts.join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

function str(v: unknown): string {
    return v == null ? '' : String(v).trim();
}
function num(v: unknown): number | undefined {
    if (v === '' || v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
/** 여러 머리글 이름 중 먼저 값이 있는 것 (옛/새 양식 호환) */
function pick(row: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) { const v = str(row[k]); if (v !== '') return v; }
    return '';
}

const DAY_NAMES = ['월', '화', '수', '목', '금'];

function classNumOfTrack(t: Track | undefined): number {
    if (!t) return 0;
    const c = t.attr?.classNum as number | undefined;
    if (typeof c === 'number') return c;
    const n = Number(t.name.split('-')[1]);
    return Number.isFinite(n) ? n : 0;
}

/** doc 의 모든 규격을 합쳐, 교시(index)마다 대표 라벨 하나를 뽑는다 (전담별·특별실별 시트가 쓸 공통 교시 축) */
function unionPeriodRows(doc: Doc): { index: number; label: string }[] {
    const map = new Map<number, string>();
    for (const spec of doc.specs) {
        for (const slot of spec.slots) {
            if (slot.kind !== 'lesson') continue;
            if (!map.has(slot.index)) map.set(slot.index, slot.label);
        }
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([index, label]) => ({ index, label }));
}

function cellText(doc: Doc, parts: { activityId?: string; trackId?: string; resourceId?: string; label?: string }): string {
    const bits: string[] = [];
    if (parts.label) bits.push(parts.label);
    else if (parts.activityId) bits.push(doc.activities.find((a) => a.id === parts.activityId)?.name ?? '');
    if (parts.trackId) {
        const t = doc.tracks.find((t) => t.id === parts.trackId);
        if (t) bits.push(t.name);
    }
    if (parts.resourceId) {
        const r = doc.resources.find((r) => r.id === parts.resourceId);
        if (r) bits.push(r.name);
    }
    return bits.filter(Boolean).join(' ');
}

// ──────────────────────────────────────────────── 시수표 → 표 (내려받기·내보내기 공용)

/** 현재 시수표를 「교사·함께 수업·과목·학년·반(접음)…」 표로. 반은 학년 전부면 '전체', 아니면 '1,2,3' */
function demandRowsAoa(doc: Doc): (string | number)[][] {
    const nameA = (id: string) => (id === HOMEROOM_AGENT_ID ? HOMEROOM_LABEL : doc.agents.find((a) => a.id === id)?.name ?? '');
    const nameAct = (id: string) => doc.activities.find((a) => a.id === id)?.name ?? '';
    const nameRoom = (id?: string) => (id ? doc.resources.find((r) => r.id === id)?.name ?? '' : '');

    interface G { row: (string | number)[]; grade: number; cls: Set<number>; }
    const groups = new Map<string, G>();
    for (const dm of doc.demands) {
        const t = doc.tracks.find((x) => x.id === dm.trackId);
        const grade = t?.grade ?? 0;
        const block = (dm.block ?? []).join(',');
        const key = [dm.agentId, dm.coAgentId ?? '', dm.activityId, grade, dm.count, dm.resourceId ?? '', dm.roomHours ?? '', block, dm.cycle ? '1' : ''].join('|');
        if (!groups.has(key)) {
            groups.set(key, {
                grade, cls: new Set<number>(),
                row: [nameA(dm.agentId), nameA(dm.coAgentId ?? '') || '', nameAct(dm.activityId), grade, '',
                    dm.count, nameRoom(dm.resourceId), dm.roomHours ?? '', block, dm.cycle ? 'Y' : ''],
            });
        }
        groups.get(key)!.cls.add(classNumOfTrack(t));
    }
    const allByGrade = new Map<number, Set<number>>();
    for (const t of doc.tracks) {
        if (t.grade == null) continue;
        if (!allByGrade.has(t.grade)) allByGrade.set(t.grade, new Set());
        allByGrade.get(t.grade)!.add(classNumOfTrack(t));
    }
    const body = [...groups.values()].map((g) => {
        const cls = [...g.cls].filter((n) => n > 0).sort((a, b) => a - b);
        const all = allByGrade.get(g.grade);
        const isAll = !!all && cls.length > 0 && cls.length === all.size && cls.every((c) => all.has(c));
        const row = [...g.row];
        row[4] = isAll ? '전체' : cls.join(',');
        return row;
    });
    body.sort((a, b) => Number(a[3]) - Number(b[3]) || String(a[0]).localeCompare(String(b[0])) || String(a[2]).localeCompare(String(b[2])));
    return [DEMAND_HEADER, ...body];
}

// ──────────────────────────────────────────────── 시수표 불러오기

export function parseDemandsWorkbook(bytes: Uint8Array, doc: Doc): ImportResult {
    const errors: string[] = [];
    const createdAgents: Agent[] = [];
    const createdTracks: Track[] = [];
    const createdActivities: Activity[] = [];
    const demands: Demand[] = [];

    let wb: XLSX.WorkBook;
    try {
        wb = XLSX.read(bytes, { type: 'array' });
    } catch (e) {
        return { agents: [], tracks: [], activities: [], demands: [], errors: [`엑셀 파일을 열 수 없습니다: ${(e as Error).message}`] };
    }

    const sheet = wb.Sheets[SHEET_DEMANDS];
    if (!sheet) {
        return { agents: [], tracks: [], activities: [], demands: [], errors: [`「${SHEET_DEMANDS}」 시트가 없습니다. 시수표 엑셀을 내려받아 그 형식을 따라 주세요.`] };
    }
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const findAgent = (name: string) => doc.agents.find((a) => a.name === name) ?? createdAgents.find((a) => a.name === name);
    const findActivity = (name: string) => doc.activities.find((a) => a.name === name) ?? createdActivities.find((a) => a.name === name);
    const findTrack = (grade: number, cls: number) =>
        doc.tracks.find((t) => t.grade === grade && (classNumOfTrack(t) === cls || t.name === `${grade}-${cls}`)) ??
        createdTracks.find((t) => t.grade === grade && (classNumOfTrack(t) === cls || t.name === `${grade}-${cls}`));
    const tracksOfGrade = (grade: number) => [...doc.tracks, ...createdTracks].filter((t) => t.grade === grade);

    const ROLES = ['전담', '비교과', '담임 겸 전담'] as const;
    const roleFrom = (raw: string): Agent['role'] => (ROLES as readonly string[]).includes(raw) ? (raw as Agent['role']) : '전담';
    const specIdByName = new Map(doc.specs.map((s) => [s.name, s.id] as const));

    // ── 교사 시트 (있으면 미리 등록: 역할·우선순위·점심 기준) ──
    const agentSheet = wb.Sheets[SHEET_AGENTS];
    if (agentSheet) {
        const arows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(agentSheet, { defval: '' });
        for (const ar of arows) {
            const name = pick(ar, '이름');
            if (!name || name === HOMEROOM_LABEL || findAgent(name)) continue;
            const tier = num(pick(ar, '우선순위', '티어'));
            const lunchName = pick(ar, '점심 기준', '점심기준');
            createdAgents.push({
                kind: 'agent', id: `a-${slugOf(name)}`, name, role: roleFrom(pick(ar, '역할')),
                tier: tier === 1 || tier === 2 || tier === 3 ? tier : undefined,
                lunchSpecId: lunchName ? specIdByName.get(lunchName) : undefined,
            });
        }
    }

    // ── 반 시트의 담임 이름 (있으면) — 새로 만드는 반에 붙인다 ──
    const homeroomByCls = new Map<string, string>();
    const trackSheet = wb.Sheets[SHEET_TRACKS];
    if (trackSheet) {
        const trows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(trackSheet, { defval: '' });
        for (const tr of trows) {
            const g = num(tr['학년']); const c = num(tr['반']);
            const hr = pick(tr, '담임 이름', '담임이름');
            if (g != null && c != null && hr) homeroomByCls.set(`${g}-${c}`, hr);
        }
    }

    const ensureAgentByName = (name: string): string | undefined => {
        if (name === HOMEROOM_LABEL) return HOMEROOM_AGENT_ID;
        if (!name) return undefined;
        const ex = findAgent(name);
        if (ex) return ex.id;
        const a: Agent = { kind: 'agent', id: `a-${slugOf(name)}`, name, role: '전담' };
        createdAgents.push(a);
        return a.id;
    };

    rows.forEach((row, i) => {
        const rowNum = i + 2; // 1행은 머리글
        const teacherName = pick(row, '교사');
        const activityName = pick(row, '과목');
        const gradeVal = num(row['학년']);
        const clsField = pick(row, '반');
        const countVal = num(pick(row, '주당 시수', '주당시수', '반당시수'));

        if (!teacherName) { errors.push(`시수표 ${rowNum}행: 교사 칸이 비었습니다`); return; }
        if (!activityName) { errors.push(`시수표 ${rowNum}행: 과목이 비었습니다`); return; }
        if (gradeVal == null || gradeVal < 1 || gradeVal > 6) { errors.push(`시수표 ${rowNum}행: 학년 값이 이상합니다('${row['학년']}')`); return; }
        if (!clsField) { errors.push(`시수표 ${rowNum}행: 반이 비었습니다`); return; }
        if (countVal == null || countVal <= 0) { errors.push(`시수표 ${rowNum}행: 주당 시수가 이상합니다('${pick(row, '주당 시수', '주당시수', '반당시수')}')`); return; }

        // 교사 (「담임」이면 HOMEROOM)
        const agentId = teacherName === HOMEROOM_LABEL ? HOMEROOM_AGENT_ID : ensureAgentByName(teacherName)!;

        // 함께 수업 (협력수업 · 빈 값 허용)
        const coName = pick(row, '함께 수업', '함께수업');
        const coAgentId = coName ? ensureAgentByName(coName) : undefined;

        // 과목
        let activity = findActivity(activityName);
        if (!activity) {
            activity = { kind: 'activity', id: `act-${slugOf(activityName)}`, name: activityName };
            createdActivities.push(activity);
        }

        // 반 목록 — "1,2,3" 또는 "전체"
        let targetTracks: Track[];
        if (clsField === '전체') {
            targetTracks = tracksOfGrade(gradeVal);
            if (targetTracks.length === 0) {
                errors.push(`시수표 ${rowNum}행: ${gradeVal}학년 반이 하나도 없어 '전체'를 알 수 없습니다`);
                return;
            }
        } else {
            const nums = clsField.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
            if (nums.length === 0) {
                errors.push(`시수표 ${rowNum}행: 반 '${clsField}'을 알 수 없습니다`);
                return;
            }
            targetTracks = [];
            for (const cls of nums) {
                let t = findTrack(gradeVal, cls);
                if (!t) {
                    const sibling = tracksOfGrade(gradeVal)[0];
                    if (!sibling) {
                        errors.push(`시수표 ${rowNum}행: 반 '${gradeVal}-${cls}'가 없고, 같은 학년의 다른 반도 없어 시간 틀을 알 수 없습니다`);
                        continue;
                    }
                    t = {
                        kind: 'track', id: `t-${slugOf(gradeVal, cls)}`, name: `${gradeVal}-${cls}`,
                        specId: sibling.specId, grade: gradeVal, attr: { classNum: cls },
                        homeroomName: homeroomByCls.get(`${gradeVal}-${cls}`),
                    };
                    createdTracks.push(t);
                }
                targetTracks.push(t);
            }
            if (targetTracks.length === 0) return;
        }

        // 특별실 (있는 것만 — 자동으로 만들지 않는다)
        const roomName = pick(row, '특별실');
        let resourceId: string | undefined;
        if (roomName) {
            const room = doc.resources.find((r) => r.name === roomName);
            if (!room) errors.push(`시수표 ${rowNum}행: 특별실 '${roomName}'가 없습니다`);
            else resourceId = room.id;
        }
        const roomHours = resourceId ? num(pick(row, '특별실 사용 시수', '특별실사용시수', '특별실시수')) : undefined;

        // 연속 수업
        const blockField = pick(row, '연속 수업', '연속수업', '연강');
        const block = blockField ? blockField.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0) : undefined;

        // 차시 순서 맞춤
        const cycle = /^y$/i.test(pick(row, '차시 순서 맞춤', '차시순서맞춤', '순배'));

        for (const track of targetTracks) {
            demands.push({
                id: `d-${slugOf(teacherName, coName, activityName, track.id, rowNum)}`,
                agentId, coAgentId, trackId: track.id, activityId: activity.id, count: countVal,
                resourceId, roomHours, block: block && block.length ? block : undefined, cycle: cycle || undefined,
            });
        }
    });

    return { agents: createdAgents, tracks: createdTracks, activities: createdActivities, demands, errors };
}

// ──────────────────────────────────────────────── 시수표 엑셀 내려받기

export function blankWorkbook(doc: Doc): Uint8Array {
    const wb = XLSX.utils.book_new();

    // 시수표 — 시수가 있으면 현재 시수표를 채워 준다. 없을 때만 예시 한 줄.
    const demandAoa = doc.demands.length
        ? demandRowsAoa(doc)
        : [DEMAND_HEADER, ['이든', '', '영어', 3, '1,2,3', 3, '', '', '', '']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(demandAoa), SHEET_DEMANDS);

    // 교사 — 이름·역할·우선순위·점심 기준
    const specNameById = new Map(doc.specs.map((s) => [s.id, s.name] as const));
    const agentRows: (string | number)[][] = [['이름', '역할', '우선순위', '점심 기준']];
    for (const a of doc.agents) {
        agentRows.push([a.name, a.role ?? '', a.tier ?? '', a.lunchSpecId ? specNameById.get(a.lunchSpecId) ?? '' : '']);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(agentRows), SHEET_AGENTS);

    // 반 — 학년·반·이름·담임 이름
    const trackRows: (string | number)[][] = [['학년', '반', '이름', '담임 이름']];
    for (const t of doc.tracks) trackRows.push([t.grade ?? '', (t.attr?.classNum as number | undefined) ?? classNumOfTrack(t) ?? '', t.name, t.homeroomName ?? '']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trackRows), SHEET_TRACKS);

    // 과목
    const activityRows: (string | number)[][] = [['이름', '특별실']];
    for (const a of doc.activities) {
        const room = doc.resources.find((r) => r.activityIds?.includes(a.id));
        activityRows.push([a.name, room?.name ?? '']);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(activityRows), SHEET_ACTIVITIES);

    // 특별실
    const resourceRows: (string | number)[][] = [['이름', '수용수', '과목들']];
    for (const r of doc.resources) {
        const names = (r.activityIds ?? []).map((id) => doc.activities.find((a) => a.id === id)?.name ?? id).join(',');
        resourceRows.push([r.name, r.capacity ?? 1, names]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resourceRows), SHEET_RESOURCES);

    const guide = [
        ['시수표 채우는 법'],
        ['교사: 교사 이름. 담임 수업이면 「담임」이라고 적습니다(특별실이 필요한 담임 수업만 적습니다).'],
        ['함께 수업: 한 칸에 함께 들어가는 둘째 교사(원어민·스포츠강사). 없으면 비웁니다.'],
        ['과목: 과목 이름. 없으면 새로 만들어집니다.'],
        ['학년: 숫자 1~6'],
        ["반: '1,2,3' 처럼 쉼표로 나열하거나 '전체'"],
        ['주당 시수: 그 반에서 주당 몇 시간인지'],
        ['특별실: 쓰는 특별실 이름. 안 쓰면 비워둡니다(특별실 시트에 있는 이름만 인식합니다).'],
        ['특별실 사용 시수: 주당 시수 중 특별실을 쓰는 시수. 비우면 전부로 봅니다.'],
        ["연속 수업: '2' 또는 '2,2'처럼 붙는 시수 묶음. 없으면 비웁니다."],
        ["차시 순서 맞춤: 반마다 차례로 1차시씩 끝내고 2차시로 넘어가야 하면 'Y'"],
        [''],
        ['교사 시트에는 전담·비교과·담임 겸 전담만 적습니다. 담임은 반 시트의 「담임 이름」에 적습니다.'],
        ['시수가 있으면 이 파일에 그대로 채워져 내려옵니다. 그대로 불러오면 같은 시수표가 됩니다.'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guide), SHEET_GUIDE);

    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

// ──────────────────────────────────────────────── 완성 시간표 내보내기

export function exportTimetableWorkbook(doc: Doc): Uint8Array {
    const wb = XLSX.utils.book_new();
    const rows = unionPeriodRows(doc);

    function buildSheet(
        entities: { id: string; name: string }[],
        matches: (assignmentAgentOrTrackOrResourceId: string | undefined, entityId: string) => boolean,
        pickId: (a: Doc['assignments'][number]) => string | undefined,
        cell: (a: Doc['assignments'][number]) => string,
    ) {
        const header = ['이름'];
        for (const day of DAY_NAMES) for (const slot of rows) header.push(`${day} ${slot.label}`);
        const body = entities.map((e) => {
            const row: (string | number)[] = [e.name];
            for (let d = 0; d < DAY_NAMES.length; d++) {
                for (const slot of rows) {
                    const hits = doc.assignments.filter((a) => a.dayIndex === d && a.slotIndex === slot.index && matches(pickId(a), e.id));
                    row.push(hits.map(cell).join('/'));
                }
            }
            return row;
        });
        return XLSX.utils.aoa_to_sheet([header, ...body]);
    }

    const agentSheet = buildSheet(
        doc.agents, (id, e) => id === e, (a) => a.agentId,
        (a) => cellText(doc, { activityId: a.activityId, trackId: a.trackId, resourceId: a.resourceId, label: a.label }),
    );
    XLSX.utils.book_append_sheet(wb, agentSheet, '전담별');

    const trackSheet = buildSheet(
        doc.tracks, (id, e) => id === e, (a) => a.trackId,
        (a) => cellText(doc, { activityId: a.activityId, resourceId: a.resourceId, label: a.label }),
    );
    XLSX.utils.book_append_sheet(wb, trackSheet, '반별');

    const resourceSheet = buildSheet(
        doc.resources, (id, e) => id === e, (a) => a.resourceId,
        (a) => cellText(doc, { activityId: a.activityId, trackId: a.trackId, label: a.label }),
    );
    XLSX.utils.book_append_sheet(wb, resourceSheet, '특별실별');

    // 시수표도 함께 (입력 원본 보존용)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(demandRowsAoa(doc)), SHEET_DEMANDS);

    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}
