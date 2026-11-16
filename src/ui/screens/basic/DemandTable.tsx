/**
 * 시수표 — 엑셀식 시트. 열 순서는 「엑셀 양식」·excel.ts 와 1:1
 *   교사 | 함께 수업 | 과목 | 학년 | 반 | 주당 시수 | 특별실 | 특별실 사용 시수 | 연속 수업 | 진도 맞춤
 * 한 행 = 「교사·함께 수업·과목·학년·조건」 묶음. 같은 조건의 여러 반을 「반」칸(다중 선택)으로 접어 보여주고(fold),
 * 저장할 땐 반대로 펼친다(unfold). 교사 칸에는 「담임」과 교사 탭의 이름만 넣을 수 있고(즉석 생성 없음),
 * 과목 이름은 없는 것을 치면 그 자리에서 새로 만든다.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../store/store';
import { uid } from '../../../store/ids';
import type { Demand } from '../../../types/schema';
import { HOMEROOM_LABEL } from '../../../types/schema';
import { fold, unfold, classNumsOfGrade, classNumsOfCell, cellHasAll } from '../../../store/demand-sheet';
import { pickDrafts, withDrafts, agentsWithoutClasses } from '../../../store/demand-drafts';
import { L } from '../../help/terms';
import { RICH } from '../../help/richContent';
import Sheet, { type SheetColumn, type SheetRow, type SheetApi } from '../../parts/Sheet';
import { Info, Button, Mark } from '../../parts/ui';
import ActivitiesTidy from './ActivitiesTidy';

// ══════════════════════════════════════════════════════════════
export default function DemandTable() {
    const st = useStore();
    const { doc } = st;
    // 과목은 새 학교에 기본 14개가 미리 들어 있어(R105) 과목 수로는 못 가른다 — 반·교사 기준
    const ready = doc.tracks.length > 0 && doc.agents.length > 0;

    // 덜 채운 줄(R108)은 문서 밖 보관에서 꺼내 접은 줄 뒤에 붙인다 — 시수표를 다시 띄워도 남는다
    const drafts = st.demandDrafts;
    const [rows, setRows] = useState<SheetRow[]>(() => withDrafts(fold(doc), drafts));
    const [api, setApi] = useState<SheetApi | null>(null);
    const apiCb = useRef((a: SheetApi) => setApi(a)).current;
    const lastPushed = useRef<Demand[] | null>(null);

    // 외부 변경(되돌리기·엑셀 불러오기·샘플)일 때만 다시 접는다. 우리 저장이면 그대로 둔다(입력 중 행 보존)
    // 다시 접을 때도 덜 채운 줄을 뒤에 다시 붙인다(되돌리기로 사라지지 않게 · R108 ④)
    useEffect(() => {
        if (doc.demands === lastPushed.current) return;
        setRows(withDrafts(fold(doc), drafts));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc.demands]);

    // 수업이 없는 교사 — 비교과(강사·보건·영양 등)와 덜 채운 줄에 이미 오른 사람은 뺀다(R108 ①)
    const idle = agentsWithoutClasses(doc, drafts);

    const agentNames = doc.agents.map((a) => a.name);
    const actNames = doc.activities.map((a) => a.name);
    const roomNames = doc.resources.map((r) => r.name);
    const gradeOptions = [...new Set(doc.tracks.map((t) => t.grade).filter((g): g is number => typeof g === 'number'))]
        .sort((a, b) => a - b).map(String);

    // 같은 학년·같은 과목의 다른 줄이 이미 가져간 반 (반 번호 → 그 반을 가진 교사)
    const takenClasses = (row: SheetRow): Map<string, string> => {
        const grade = Number(row.학년);
        const taken = new Map<string, string>();
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
        return taken;
    };

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
            optionsOf: (row) => classNumsOfGrade(doc.tracks, Number(row.학년)),
            disabledOptions: (row) => {
                const out: Record<string, string> = {};
                for (const [cls, teacher] of takenClasses(row)) out[cls] = `${teacher} 교사 줄에 있습니다`;
                return out;
            },
            selectAll: (row) => (takenClasses(row).size > 0 ? '나머지 전체' : '전체'),
            format: (v, row) => {
                const cls = Array.isArray(v) ? v.map(String) : classNumsOfCell(v, Number(row.학년), doc.tracks).map(String);
                const all = classNumsOfGrade(doc.tracks, Number(row.학년));
                return all.length > 0 && cls.length === all.length && all.every((c) => cls.includes(c)) ? '전체' : cls.join(', ');
            },
            tooltip: (v, row) => {
                const cls = Array.isArray(v) ? v.map(String) : classNumsOfCell(v, Number(row.학년), doc.tracks).map(String);
                return cls.length > 0 ? `${cls.length}개 반: ${cls.map((c) => c + '반').join(', ')}` : undefined;
            },
            validate: (v, row) => (classNumsOfCell(v, Number(row.학년), doc.tracks).length === 0 ? '반을 골라 주세요' : undefined),
        },
        { key: '주당시수', title: L.hoursPerClass, type: 'number', width: 84, validate: (v) => (v === '' || Number(v) <= 0 ? '1 이상' : undefined) },
        { key: '특별실', title: L.resource, type: 'select', options: roomNames, allowEmpty: true, width: 110 },
        { key: '특별실사용시수', title: L.roomHours, type: 'number', width: 118, help: '주당 시수 중 특별실을 쓰는 시수입니다. 비우면 전부로 봅니다.' },
        { key: '연속수업', title: L.block, type: 'text', width: 100, placeholder: '예: 2,2', help: '2 = 2시간 연속, 2,2 = 2시간씩 두 번' },
        { key: '차시순서맞춤', title: L.cycle, type: 'bool', width: 104, help: '(순배) 같은 교사·학년·과목의 모든 반이 1차시를 마친 뒤에 2차시를 시작하게 맞춥니다.' },
    ];
    // 학년·교사·과목은 머리글로 정렬할 수 있게
    columns[0].sortable = true;   // 교사
    columns[2].sortable = true;   // 과목

    const commit = (next: SheetRow[]) => {
        // 저장값에 '전체' 를 남기지 않는다 — 옛 값·붙여넣기·엑셀로 들어온 '전체'는 개별 반 번호로 푼다
        const normalized = next.map((r) =>
            cellHasAll(r.반)
                ? { ...r, 반: classNumsOfCell(r.반, Number(r.학년), doc.tracks).map(String) }
                : r);
        setRows(normalized);
        const built = unfold(doc, normalized);
        lastPushed.current = built.demands;
        // 문서에 못 들어가는 줄은 문서 밖에 따로 보관한다(내보내기·자동 보관본에 끼지 않게 · R108 ③)
        const nextDrafts = pickDrafts(doc, normalized);
        if (JSON.stringify(nextDrafts) !== JSON.stringify(drafts)) st.setDemandDrafts(nextDrafts);
        st.act.applyDemandSheet(built);
    };
    const newRow = (): SheetRow => ({ _id: uid('g'), 교사: '', 함께수업: '', 과목: '', 학년: '', 반: [], 주당시수: 1, 특별실: '', 특별실사용시수: '', 연속수업: '', 차시순서맞춤: false });
    /** 알림의 이름을 누르면 그 교사 줄을 하나 만든다(R108 ②) */
    const addRowFor = (name: string) => commit([...rows, { ...newRow(), 교사: name }]);

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[13px] font-medium mr-1">{L.demandTable}</div>
                <Button icon="plus" onClick={() => api?.addRow()}>행 추가</Button>
                <Button icon="trash" onClick={() => api?.deleteSelectedRows()}>선택 행 삭제</Button>
                <Info help={RICH.demandTable} />
                <ActivitiesTidy />
            </div>
            {!ready && <p className="text-[13px] text-warn"><Mark kind="warn" /> 먼저 「반」과 「교사」 탭을 채워 주세요. 과목 이름은 여기서 쳐도 바로 만들어집니다.</p>}
            {ready && idle.length > 0 && (
                <p className="text-[12px] text-muted flex items-center gap-1 flex-wrap" data-testid="idle-agents">
                    <span>수업이 없는 교사:</span>
                    {idle.map((a) => (
                        <button key={a.id} type="button" className="underline hover:text-fg"
                            title={`${a.name} 교사 줄을 하나 만듭니다`} onClick={() => addRowFor(a.name)}>{a.name}</button>
                    ))}
                    <span>— 이름을 누르면 그 교사 줄이 생깁니다. 「비교과」 역할은 여기 뜨지 않습니다.</span>
                </p>
            )}
            <div data-tour="demand-sheet">
                <Sheet columns={columns} rows={rows} onCommit={commit} newRow={newRow} onApi={apiCb}
                    onUndo={st.undo} onRedo={st.redo} minWidth={1040} defaultSort={{ key: '학년', dir: 'asc' }} />
            </div>
            <p className="text-[11px] text-muted">저장할 때 학년·교사·과목 순으로 정리되며, 조건이 같은 줄은 한 줄로 합쳐집니다. 「함께 수업」은 원어민·스포츠강사처럼 한 칸에 함께 들어가는 둘째 교사입니다. 「반」 칸의 「전체」는 그 학년의 반을 모두 고른 것입니다. 다른 줄이 이미 가져간 반이 있으면 「나머지 전체」로 보입니다.</p>
            <p className="text-[11px] text-muted" data-testid="drafts-note">덜 채운 줄은 이 PC 에만 보관됩니다{drafts.length > 0 ? ` (지금 ${drafts.length}줄 — 파일 저장·내보내기에는 다 채운 줄만 들어갑니다)` : ''}.</p>
        </div>
    );
}
