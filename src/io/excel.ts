/**
 * 엑셀 입출력 — 교사별 시수표 한 장이 입구다 (컴시간이 그렇게 한다).
 * SheetJS(xlsx)로 구현. 브라우저(웹 빌드)·Electron 렌더러 어디서든 그대로 돈다(파일시스템 안 씀).
 */
import * as XLSX from 'xlsx';
import type { Doc } from '../types/doc';
import type { Agent, Track, Activity, Demand } from '../types/schema';

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
const SHEET_GUIDE = '안내';

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

const DAY_NAMES = ['월', '화', '수', '목', '금'];

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
        return { agents: [], tracks: [], activities: [], demands: [], errors: [`「${SHEET_DEMANDS}」 시트가 없습니다. 빈 양식을 내려받아 그 형식을 따라 주세요.`] };
    }
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const findAgent = (name: string) => doc.agents.find((a) => a.name === name) ?? createdAgents.find((a) => a.name === name);
    const findActivity = (name: string) => doc.activities.find((a) => a.name === name) ?? createdActivities.find((a) => a.name === name);
    const findTrack = (grade: number, cls: number) =>
        doc.tracks.find((t) => t.grade === grade && ((t.attr?.classNum as number | undefined) === cls || t.name === `${grade}-${cls}`)) ??
        createdTracks.find((t) => t.grade === grade && ((t.attr?.classNum as number | undefined) === cls || t.name === `${grade}-${cls}`));
    const tracksOfGrade = (grade: number) => [...doc.tracks, ...createdTracks].filter((t) => t.grade === grade);

    const ROLES = ['담임', '전담', '비교과'] as const;

    rows.forEach((row, i) => {
        const rowNum = i + 2; // 1행은 머리글
        const teacherName = str(row['교사']);
        const activityName = str(row['과목']);
        const gradeVal = num(row['학년']);
        const clsField = str(row['반']);
        const countVal = num(row['반당시수']);

        if (!teacherName) { errors.push(`시수표 ${rowNum}행: 교사 이름이 비었습니다`); return; }
        if (!activityName) { errors.push(`시수표 ${rowNum}행: 과목이 비었습니다`); return; }
        if (gradeVal == null || gradeVal < 1 || gradeVal > 6) { errors.push(`시수표 ${rowNum}행: 학년 값이 이상합니다('${row['학년']}')`); return; }
        if (!clsField) { errors.push(`시수표 ${rowNum}행: 반이 비었습니다`); return; }
        if (countVal == null || countVal <= 0) { errors.push(`시수표 ${rowNum}행: 반당시수가 이상합니다('${row['반당시수']}')`); return; }

        // 교사
        let agent = findAgent(teacherName);
        if (!agent) {
            const roleRaw = str(row['역할']);
            const role = (ROLES as readonly string[]).includes(roleRaw) ? (roleRaw as Agent['role']) : '전담';
            if (roleRaw && role !== roleRaw) errors.push(`시수표 ${rowNum}행: 역할 '${roleRaw}'을 몰라 '전담'으로 넣었습니다`);
            const tier = num(row['티어']);
            agent = {
                kind: 'agent', id: `a-${slugOf(teacherName)}`, name: teacherName, role,
                tier: tier === 1 || tier === 2 || tier === 3 ? tier : undefined,
            };
            createdAgents.push(agent);
        }

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
                        errors.push(`시수표 ${rowNum}행: 반 '${gradeVal}-${cls}'가 없고, 같은 학년의 다른 반도 없어 규격을 알 수 없습니다`);
                        continue;
                    }
                    t = { kind: 'track', id: `t-${slugOf(gradeVal, cls)}`, name: `${gradeVal}-${cls}`, specId: sibling.specId, grade: gradeVal, attr: { classNum: cls } };
                    createdTracks.push(t);
                }
                targetTracks.push(t);
            }
            if (targetTracks.length === 0) return;
        }

        // 특별실 (있는 것만 — 자동으로 만들지 않는다)
        const roomName = str(row['특별실']);
        let resourceId: string | undefined;
        if (roomName) {
            const room = doc.resources.find((r) => r.name === roomName);
            if (!room) errors.push(`시수표 ${rowNum}행: 특별실 '${roomName}'가 없습니다`);
            else resourceId = room.id;
        }
        const roomHours = resourceId ? num(row['특별실시수']) : undefined;

        // 연강
        const blockField = str(row['연강']);
        const block = blockField ? blockField.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0) : undefined;

        // 순배
        const cycle = /^y$/i.test(str(row['순배']));

        for (const track of targetTracks) {
            demands.push({
                id: `d-${slugOf(teacherName, activityName, track.id, rowNum)}`,
                agentId: agent.id, trackId: track.id, activityId: activity.id, count: countVal,
                resourceId, roomHours, block: block && block.length ? block : undefined, cycle: cycle || undefined,
            });
        }
    });

    return { agents: createdAgents, tracks: createdTracks, activities: createdActivities, demands, errors };
}

// ──────────────────────────────────────────────── 빈 양식 내려받기

export function blankWorkbook(doc: Doc): Uint8Array {
    const wb = XLSX.utils.book_new();

    const demandHeader = ['교사', '역할', '티어', '과목', '학년', '반', '반당시수', '특별실', '특별실시수', '연강', '순배'];
    const demandExample = ['이든', '전담', 1, '영어', 3, '1,2,3', 3, '', '', '', ''];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([demandHeader, demandExample]), SHEET_DEMANDS);

    const trackRows: (string | number)[][] = [['학년', '반', '이름']];
    for (const t of doc.tracks) trackRows.push([t.grade ?? '', (t.attr?.classNum as number | undefined) ?? '', t.name]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trackRows), SHEET_TRACKS);

    const activityRows: (string | number)[][] = [['이름', '특별실']];
    for (const a of doc.activities) {
        const room = doc.resources.find((r) => r.activityIds?.includes(a.id));
        activityRows.push([a.name, room?.name ?? '']);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(activityRows), SHEET_ACTIVITIES);

    const resourceRows: (string | number)[][] = [['이름', '수용수', '과목들']];
    for (const r of doc.resources) {
        const names = (r.activityIds ?? []).map((id) => doc.activities.find((a) => a.id === id)?.name ?? id).join(',');
        resourceRows.push([r.name, r.capacity ?? 1, names]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resourceRows), SHEET_RESOURCES);

    const guide = [
        ['시수표 채우는 법'],
        ['교사: 교사 이름. 이미 있으면 그대로 쓰이고, 없으면 새로 만들어집니다.'],
        ['역할: 담임 / 전담 / 비교과'],
        ['티어: 1(보직) 2(일반) 3(지원인력). 비워도 됩니다.'],
        ['과목: 과목 이름'],
        ['학년: 숫자 1~6'],
        ["반: '1,2,3' 처럼 쉼표로 나열하거나 '전체'"],
        ['반당시수: 그 반에서 주당 몇 시간인지'],
        ['특별실: 쓰는 특별실 이름. 안 쓰면 비워둡니다(특별실 시트에 있는 이름만 인식합니다).'],
        ['특별실시수: 반당시수 중 특별실을 쓰는 시수. 비우면 전부로 봅니다.'],
        ["연강: '2' 또는 '2,2'처럼 붙는 시수 묶음. 없으면 비웁니다."],
        ["순배: 반마다 차례로 1차시씩 끝내고 2차시로 넘어가야 하면 'Y'"],
        [''],
        ['둘째 줄(예시 행)은 지우고 채워 주세요.'],
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
        pick: (a: Doc['assignments'][number]) => string | undefined,
        cell: (a: Doc['assignments'][number]) => string,
    ) {
        const header = ['이름'];
        for (const day of DAY_NAMES) for (const slot of rows) header.push(`${day} ${slot.label}`);
        const body = entities.map((e) => {
            const row: (string | number)[] = [e.name];
            for (let d = 0; d < DAY_NAMES.length; d++) {
                for (const slot of rows) {
                    const hits = doc.assignments.filter((a) => a.dayIndex === d && a.slotIndex === slot.index && matches(pick(a), e.id));
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

    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}
