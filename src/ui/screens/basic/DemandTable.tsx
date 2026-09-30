/**
 * 시수표 — 엑셀식 시트. 열 순서는 「엑셀 양식」·excel.ts 와 1:1
 *   교사 | 함께 수업 | 과목 | 학년 | 반 | 주당 시수 | 특별실 | 특별실 사용 시수 | 연속 수업 | 차시 순서 맞춤
 * 한 행 = 「교사·함께 수업·과목·학년·조건」 묶음. 같은 조건의 여러 반을 「반」칸(다중 선택)으로 접어 보여주고(fold),
 * 저장할 땐 반대로 펼친다(unfold). 교사 칸에는 「담임」과 교사 탭의 이름만 넣을 수 있고(즉석 생성 없음),
 * 과목 이름은 없는 것을 치면 그 자리에서 새로 만든다.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../store/store';
import { uid } from '../../../store/ids';
import type { Doc } from '../../../types/doc';
import type { Agent, Activity, Track, Demand } from '../../../types/schema';
import { HOMEROOM_AGENT_ID, HOMEROOM_LABEL } from '../../../types/schema';
import { L } from '../../help/terms';
import { RICH } from '../../help/richContent';
import Sheet, { type SheetColumn, type SheetRow, type SheetApi, type CellValue } from '../../parts/Sheet';
import { Info, Button, Mark } from '../../parts/ui';

// ── 도우미 ────────────────────────────────────────────────────
function classNumOf(t: Track | undefined): number {
    if (!t) return 0;
    const c = t.attr?.classNum as number | undefined;
    if (typeof c === 'number') return c;
    const n = Number(t.name.split('-')[1]);
    return Number.isFinite(n) ? n : 0;
}

/** 그 학년에 있는 반 번호(문자열) 목록 */
function classNumsOfGrade(all: Track[], grade: number): string[] {
    return [...new Set(all.filter((t) => t.grade === grade).map(classNumOf))].filter((n) => n > 0)
        .sort((a, b) => a - b).map(String);
}

/** 셀 값(배열 또는 「1,3,5」·「전체」 문자열)을 반 번호 목록으로 */
function classNumsOfCell(v: CellValue | undefined, grade: number, all: Track[]): number[] {
    const parts = Array.isArray(v)
        ? v.map((s) => String(s).trim())
        : String(v ?? '').split(',').map((s) => s.trim());
    if (parts.includes('전체')) return classNumsOfGrade(all, grade).map(Number);
    return [...new Set(parts.map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n > 0))];
}

function parseBlock(s: string): number[] | undefined {
    const nums = s.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length ? nums : undefined;
}

// ── 접기 (Demand[] → 시트 행) ─────────────────────────────────
function fold(doc: Doc): SheetRow[] {
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
function unfold(doc: Doc, rows: SheetRow[]) {
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

// ══════════════════════════════════════════════════════════════
export default function DemandTable() {
    const st = useStore();
    const { doc } = st;
    const ready = doc.agents.length > 0 || doc.activities.length > 0 || doc.tracks.length > 0;

    const [rows, setRows] = useState<SheetRow[]>(() => fold(doc));
    const [api, setApi] = useState<SheetApi | null>(null);
    const apiCb = useRef((a: SheetApi) => setApi(a)).current;
    const lastPushed = useRef<Demand[] | null>(null);

    // 외부 변경(되돌리기·엑셀 불러오기·샘플)일 때만 다시 접는다. 우리 저장이면 그대로 둔다(입력 중 행 보존)
    useEffect(() => {
        if (doc.demands === lastPushed.current) return;
        setRows(fold(doc));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc.demands]);

    const agentNames = doc.agents.map((a) => a.name);
    const actNames = doc.activities.map((a) => a.name);
    const roomNames = doc.resources.map((r) => r.name);
    const gradeOptions = [...new Set(doc.tracks.map((t) => t.grade).filter((g): g is number => typeof g === 'number'))]
        .sort((a, b) => a - b).map(String);

    const columns: SheetColumn[] = [
        {
            key: '교사', title: L.agent, type: 'select', options: [HOMEROOM_LABEL, ...agentNames], width: 110,
            validate: (v) => {
                const s = String(v ?? '').trim();
                if (!s) return '교사를 골라 주세요';
                if (s !== HOMEROOM_LABEL && !agentNames.includes(s)) return '교사 탭에 없는 이름입니다';
                return undefined;
            },
        },
        { key: '함께수업', title: L.coAgent, type: 'select', options: agentNames, allowEmpty: true, width: 100, help: '두 교사가 한 칸에 함께 들어가는 수업입니다(원어민+영어 전담 등). 없으면 비웁니다.' },
        {
            key: '과목', title: L.activity, type: 'combo', options: actNames, width: 100,
            validate: (v) => (!String(v).trim() ? '과목을 적어 주세요' : undefined),
            note: (v) => { const n = String(v).trim(); return n && !actNames.includes(n) ? `‘${n}’ 과목을 새로 만듭니다` : undefined; },
        },
        {
            key: '학년', title: '학년', type: 'select', options: gradeOptions, width: 64, sortable: true,
            validate: (v) => (String(v ?? '').trim() === '' ? '학년을 골라 주세요' : undefined),
        },
        {
            key: '반', title: L.track, type: 'multiselect', width: 130, placeholder: '반을 고르세요',
            optionsOf: (row) => ['전체', ...classNumsOfGrade(doc.tracks, Number(row.학년))],
            disabledOptions: (row) => {
                const grade = Number(row.학년);
                const taken = new Map<string, string>();   // 반 번호 → 그 반을 이미 가진 교사
                for (const other of rows) {
                    if (other._id === row._id) continue;
                    if (Number(other.학년) !== grade) continue;
                    if (String(other.과목 ?? '').trim() !== String(row.과목 ?? '').trim()) continue;
                    const teacher = String(other.교사 ?? '').trim() || '다른';
                    for (const c of classNumsOfCell(other.반, grade, doc.tracks)) {
                        const key = String(c);
                        if (!taken.has(key)) taken.set(key, teacher);
                    }
                }
                const out: Record<string, string> = {};
                for (const [cls, teacher] of taken) out[cls] = `${teacher} 교사 줄에 있습니다`;
                if (taken.size > 0) out['전체'] = '일부 반이 다른 줄에 있습니다';
                return out;
            },
            validate: (v, row) => (classNumsOfCell(v, Number(row.학년), doc.tracks).length === 0 ? '반을 골라 주세요' : undefined),
        },
        { key: '주당시수', title: L.hoursPerClass, type: 'number', width: 84, validate: (v) => (v === '' || Number(v) <= 0 ? '1 이상' : undefined) },
        { key: '특별실', title: L.resource, type: 'select', options: roomNames, allowEmpty: true, width: 110 },
        { key: '특별실사용시수', title: L.roomHours, type: 'number', width: 118, help: '주당 시수 중 특별실을 쓰는 시수입니다. 비우면 전부로 봅니다.' },
        { key: '연속수업', title: L.block, type: 'text', width: 100, placeholder: '예: 2,2', help: '2 = 2시간 연속, 2,2 = 2시간씩 두 번' },
        { key: '차시순서맞춤', title: L.cycle, type: 'bool', width: 104, help: '같은 교사·학년·과목의 모든 반이 1차시를 마친 뒤에 2차시를 시작하게 맞춥니다.' },
    ];
    // 학년·교사·과목은 머리글로 정렬할 수 있게
    columns[0].sortable = true;   // 교사
    columns[2].sortable = true;   // 과목

    const commit = (next: SheetRow[]) => {
        setRows(next);
        const built = unfold(doc, next);
        lastPushed.current = built.demands;
        st.act.applyDemandSheet(built);
    };
    const newRow = (): SheetRow => ({ _id: uid('g'), 교사: '', 함께수업: '', 과목: '', 학년: '', 반: [], 주당시수: 1, 특별실: '', 특별실사용시수: '', 연속수업: '', 차시순서맞춤: false });

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[13px] font-medium mr-1">{L.demandTable}</div>
                <Button icon="plus" onClick={() => api?.addRow()}>행 추가</Button>
                <Button icon="trash" onClick={() => api?.deleteSelectedRows()}>선택 행 삭제</Button>
                <Info help={RICH.demandTable} />
            </div>
            {!ready && <p className="text-[13px] text-warn"><Mark kind="warn" /> 먼저 「반」과 「교사」 탭을 채워 주세요. 과목 이름은 여기서 쳐도 바로 만들어집니다.</p>}
            <div data-tour="demand-sheet">
                <Sheet columns={columns} rows={rows} onCommit={commit} newRow={newRow} onApi={apiCb}
                    onUndo={st.undo} onRedo={st.redo} minWidth={1040} defaultSort={{ key: '학년', dir: 'asc' }} />
            </div>
            <p className="text-[11px] text-muted">저장할 때 학년·교사·과목 순으로 정리되며, 조건이 같은 줄은 한 줄로 합쳐집니다. 「함께 수업」은 원어민·스포츠강사처럼 한 칸에 함께 들어가는 둘째 교사입니다.</p>
        </div>
    );
}
