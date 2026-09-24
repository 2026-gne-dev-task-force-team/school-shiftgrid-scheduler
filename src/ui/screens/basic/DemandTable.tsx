/**
 * 시수표 — 엑셀식 시트. 열 순서는 「엑셀 불러오기 양식」과 1:1
 *   교사 | 과목 | 학년 | 반 | 반당시수 | 특별실 | 특별실시수 | 연강 | 순배
 * 한 행 = 「교사·과목·학년」 묶음. 같은 조건의 Demand 들을 「반 목록」으로 접어 보여주고(fold),
 * 저장할 땐 반대로 펼친다(unfold). 「반」칸은 1,2,3 또는 전체. 교사·과목 이름은 자동완성이고
 * 없는 이름을 치면 그 자리에서 새로 만든다.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../store/store';
import { uid } from '../../../store/ids';
import type { Doc } from '../../../types/doc';
import type { Agent, Activity, Track, Demand } from '../../../types/schema';
import Sheet, { type SheetColumn, type SheetRow, type SheetApi } from '../../parts/Sheet';
import { Info, Button, Mark } from '../../parts/ui';

// ── 접기 (Demand[] → 시트 행) ─────────────────────────────────
function classNumOf(t: Track | undefined): number {
    if (!t) return 0;
    const c = t.attr?.classNum as number | undefined;
    if (typeof c === 'number') return c;
    const n = Number(t.name.split('-')[1]);
    return Number.isFinite(n) ? n : 0;
}

function fold(doc: Doc): SheetRow[] {
    const nameOfAgent = (id: string) => doc.agents.find((a) => a.id === id)?.name ?? '';
    const nameOfAct = (id: string) => doc.activities.find((a) => a.id === id)?.name ?? '';
    const nameOfRoom = (id?: string) => (id ? doc.resources.find((r) => r.id === id)?.name ?? '' : '');

    const groups = new Map<string, SheetRow>();
    const classes = new Map<string, Set<number>>();
    for (const dm of doc.demands) {
        const t = doc.tracks.find((x) => x.id === dm.trackId);
        const grade = t?.grade ?? 0;
        const block = (dm.block ?? []).join(',');
        const key = [dm.agentId, dm.activityId, grade, dm.count, dm.resourceId ?? '', dm.roomHours ?? '', block, dm.cycle ? '1' : ''].join('|');
        if (!groups.has(key)) {
            groups.set(key, {
                _id: `g|${key}`,
                교사: nameOfAgent(dm.agentId), 과목: nameOfAct(dm.activityId), 학년: grade, 반: '',
                반당시수: dm.count, 특별실: nameOfRoom(dm.resourceId), 특별실시수: dm.roomHours ?? '',
                연강: block, 순배: !!dm.cycle,
            });
            classes.set(key, new Set());
        }
        classes.get(key)!.add(classNumOf(t));
    }
    const out: SheetRow[] = [...groups.entries()].map(([key, row]) => {
        const cls = [...classes.get(key)!].filter((n) => n > 0).sort((a, b) => a - b);
        return { ...row, 반: cls.join(',') };
    });
    out.sort((a, b) => Number(a.학년) - Number(b.학년) || String(a.교사).localeCompare(String(b.교사)) || String(a.과목).localeCompare(String(b.과목)));
    return out;
}

// ── 펼치기 (시트 행 → Demand[] + 새 엔티티) ───────────────────
function parseClasses(field: string, grade: number, all: Track[]): number[] {
    const f = field.trim();
    if (f === '전체') return [...new Set(all.filter((t) => t.grade === grade).map(classNumOf))].filter((n) => n > 0).sort((a, b) => a - b);
    return [...new Set(f.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0))];
}
function parseBlock(s: string): number[] | undefined {
    const nums = s.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length ? nums : undefined;
}

function unfold(doc: Doc, rows: SheetRow[]) {
    const agentByName = new Map(doc.agents.map((a) => [a.name, a] as const));
    const actByName = new Map(doc.activities.map((a) => [a.name, a] as const));
    const roomByName = new Map(doc.resources.map((r) => [r.name, r.id] as const));
    const newAgents: Agent[] = [];
    const newActivities: Activity[] = [];
    const newTracks: Track[] = [];
    const allTracks = () => [...doc.tracks, ...newTracks];

    const ensureAgent = (name: string): string => {
        const ex = agentByName.get(name);
        if (ex) return ex.id;
        const a: Agent = { kind: 'agent', id: uid('a'), name, role: '전담' };
        agentByName.set(name, a); newAgents.push(a); return a.id;
    };
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
        const count = Number(r.반당시수);
        if (!teacher || !subject || !Number.isFinite(grade) || grade < 1 || grade > 6 || !Number.isFinite(count) || count <= 0) continue;
        const classes = parseClasses(String(r.반 ?? ''), grade, allTracks());
        if (classes.length === 0) continue;
        const agentId = ensureAgent(teacher);
        const activityId = ensureActivity(subject);
        const roomName = String(r.특별실 ?? '').trim();
        const resourceId = roomName ? roomByName.get(roomName) : undefined;
        const roomHours = resourceId && r.특별실시수 !== '' && r.특별실시수 != null ? Number(r.특별실시수) : undefined;
        const block = parseBlock(String(r.연강 ?? ''));
        const cycle = !!r.순배;
        for (const cls of classes) {
            const t = trackOf(grade, cls);
            if (!t) continue;
            const key = `${agentId}|${t.id}|${activityId}`;
            demands.push({
                id: existingByKey.get(key) ?? uid('dm'),
                agentId, trackId: t.id, activityId, count,
                resourceId, roomHours, block, cycle: cycle || undefined,
            });
        }
    }
    return { newAgents, newActivities, newTracks, demands };
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

    const columns: SheetColumn[] = [
        {
            key: '교사', title: '교사', type: 'text', suggest: agentNames, width: 110,
            validate: (v) => (!String(v).trim() ? '교사 이름을 적어 주세요' : undefined),
            note: (v) => { const n = String(v).trim(); return n && !agentNames.includes(n) ? `‘${n}’ 교사를 새로 만듭니다` : undefined; },
        },
        {
            key: '과목', title: '과목', type: 'text', suggest: actNames, width: 100,
            validate: (v) => (!String(v).trim() ? '과목을 적어 주세요' : undefined),
            note: (v) => { const n = String(v).trim(); return n && !actNames.includes(n) ? `‘${n}’ 과목을 새로 만듭니다` : undefined; },
        },
        { key: '학년', title: '학년', type: 'number', width: 64, validate: (v) => (v === '' ? '학년' : (Number(v) < 1 || Number(v) > 6 ? '1~6' : undefined)) },
        {
            key: '반', title: '반', type: 'text', width: 96, placeholder: '1,2,3 또는 전체',
            validate: (v, row) => { const cls = parseClasses(String(v ?? ''), Number(row.학년), doc.tracks); return String(v ?? '').trim() === '' ? '반을 적어 주세요' : (cls.length === 0 ? '반을 알 수 없습니다' : undefined); },
        },
        { key: '반당시수', title: '반당시수', type: 'number', width: 84, validate: (v) => (v === '' || Number(v) <= 0 ? '1 이상' : undefined) },
        { key: '특별실', title: '특별실', type: 'select', options: roomNames, allowEmpty: true, width: 110 },
        { key: '특별실시수', title: '특별실시수', type: 'number', width: 94 },
        { key: '연강', title: '연강', type: 'text', width: 78, placeholder: '예: 2,2' },
        { key: '순배', title: '순배', type: 'bool', width: 60 },
    ];

    const commit = (next: SheetRow[]) => {
        setRows(next);
        const built = unfold(doc, next);
        lastPushed.current = built.demands;
        st.act.applyDemandSheet(built);
    };
    const newRow = (): SheetRow => ({ _id: uid('g'), 교사: '', 과목: '', 학년: '', 반: '', 반당시수: 1, 특별실: '', 특별실시수: '', 연강: '', 순배: false });

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[13px] font-medium mr-1">시수표</div>
                <Button icon="plus" onClick={() => api?.addRow()}>행 추가</Button>
                <Button icon="trash" onClick={() => api?.deleteSelectedRows()}>선택 행 삭제</Button>
                <Info lines={[
                    '한 줄 = 한 교사가 한 과목을 한 학년에. 「반」칸에 1,2,3 또는 전체를 적으면 반마다 하나씩 펼쳐집니다.',
                    '엑셀에서 교사별 시수표를 그대로 복사해 붙일 수 있습니다(열 순서가 같습니다).',
                    '교사·과목 이름을 새로 치면 그 자리에서 만들어집니다(파란 테두리로 알려줍니다). 특별실은 「특별실」 탭에 있는 이름만 됩니다.',
                ]} />
            </div>
            {!ready && <p className="text-[13px] text-warn"><Mark kind="warn" /> 교사·과목·반이 없어도 여기서 이름을 치면 바로 만들어집니다. 반은 「반」탭에서 먼저 만드는 편이 좋습니다.</p>}
            <Sheet columns={columns} rows={rows} onCommit={commit} newRow={newRow} onApi={apiCb} onUndo={st.undo} onRedo={st.redo} minWidth={900} />
            <p className="text-[11px] text-muted">연강 칸: 비우면 없음 · <code className="text-text">2</code> 2시간 붙여서 · <code className="text-text">2,2</code> 2+2. 순배는 같은 교사·학년·과목의 모든 반이 1차시를 끝내야 2차시로 갑니다.</p>
        </div>
    );
}
