/** 인쇄·내보내기 — 반별/교사별/특별실별 인쇄용 표(흑백에서도 읽히게) · 인쇄 · 엑셀 · 작업 파일 */
import { useState } from 'react';
import { useStore } from '../../store/store';
import { platform } from '../../platform';
import { exportTimetableWorkbook } from '../../io/excel';
import type { Assignment, TimetableSpec } from '../../types/schema';
import { HOMEROOM_AGENT_ID } from '../../types/schema';
import { indexBy, assignableSlots, activeDays, dayName, allLessonStarts, slotStartOf, indexAssignments, cellAt, agentLabelOf } from '../lib';
import { Button, Info, EmptyGuide } from '../parts/ui';
import { L } from '../help/terms';
import { RICH } from '../help/richContent';

type View = 'track' | 'agent' | 'resource';

export default function ExportScreen() {
    const st = useStore();
    const { doc } = st;
    const [view, setView] = useState<View>('track');

    const exportExcel = async () => {
        const bytes = st.runEngine('엑셀 만들기', () => exportTimetableWorkbook(doc));
        if (bytes) await st.runEngineAsync(L.exportExcel, () =>
            platform.exportFile(`${doc.meta.name || '시간표'}.xlsx`, bytes,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    };
    const exportJson = async () => {
        await st.runEngineAsync('작업 파일 저장', () =>
            platform.exportFile(`${doc.meta.name || '시간표'}.shiftgrid.json`, JSON.stringify(doc, null, 1), 'application/json'));
    };

    if (doc.assignments.length === 0) {
        return <EmptyGuide icon="printer" lines={['아직 인쇄할 시간표가 없습니다.', '먼저 자동 배정으로 시간표를 만드세요.']}
            actionLabel="자동 배정으로 가기" actionIcon="sparkles" onAction={() => st.setScreen('generate')} />;
    }

    return (
        <div className="p-4">
            <div className="no-print flex items-center gap-2 flex-wrap mb-3">
                <div className="flex rounded-md overflow-hidden border border-line">
                    {(['track', 'agent', 'resource'] as View[]).map((v) => (
                        <button key={v} onClick={() => setView(v)}
                            className={`px-3 py-1.5 text-[12px] ${view === v ? 'bg-accent text-white' : 'bg-panel2 text-muted hover:text-text'}`}>
                            {v === 'track' ? '반별' : v === 'agent' ? '교사별' : '특별실별'}
                        </button>
                    ))}
                </div>
                <Button data-tour="export-print" icon="printer" onClick={() => void platform.print()}>{L.print}</Button>
                <Button icon="download" onClick={() => void exportExcel()}>{L.exportExcel}</Button>
                <Button icon="save" onClick={() => void exportJson()}>작업 파일로 저장</Button>
                <Info help={RICH.export} />
            </div>

            <div className="print-area space-y-6">
                <h1 className="text-[16px] font-semibold">{doc.meta.name} <span className="text-muted font-normal text-[13px]">{doc.meta.term}</span></h1>
                {view === 'track' && <TrackTables />}
                {view === 'agent' && <OwnerTables view="agent" />}
                {view === 'resource' && <OwnerTables view="resource" />}
            </div>
        </div>
    );
}

type IxT = ReturnType<typeof buildIx>;
function buildIx(doc: ReturnType<typeof useStore>['doc']) {
    return { agents: indexBy(doc.agents), activities: indexBy(doc.activities), resources: indexBy(doc.resources), tracks: indexBy(doc.tracks) };
}

/** 한 배치의 두 줄 문자열 (과목 / 관계자) */
function oneLine(a: Assignment, ix: IxT, owner?: View): string {
    const act = a.activityId ? ix.activities.get(a.activityId)?.name : a.label;
    const agent = agentLabelOf(a, ix);
    const res = a.resourceId ? ix.resources.get(a.resourceId)?.name : undefined;
    const track = ix.tracks.get(a.trackId)?.name;
    const sub = owner === 'agent' ? [track, res] : owner === 'resource' ? [track, agent] : [agent, res];
    return [act, sub.filter(Boolean).join(' ')].filter(Boolean).join('\n');
}
/** 한 칸에 여러 배치가 있으면 줄로 이어 붙인다 (선생님 의견 #14 — 인쇄는 흑백이라 글자로) */
function cellLines(list: Assignment[], ix: IxT, owner?: View): string {
    return list.map((a) => oneLine(a, ix, owner)).join('\n· ');
}

function TrackTables() {
    const st = useStore();
    const doc = st.doc;
    const ix = buildIx(doc);
    const asgIx = indexAssignments(doc.assignments);
    const tracks = doc.tracks.slice().sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0));
    if (tracks.length === 0) return <p className="text-[13px] text-muted no-print">반이 없습니다.</p>;
    return (
        <>
            {tracks.map((t) => {
                const spec = doc.specs.find((s) => s.id === t.specId);
                if (!spec) return null;
                const title = t.homeroomName ? `${t.name} (${L.homeroom} ${t.homeroomName})` : t.name;
                return (
                    <div key={t.id} className="break-inside-avoid">
                        <div className="text-[13px] font-medium mb-1">{title}</div>
                        <GridTable spec={spec}
                            cell={(day, slotIndex) => cellLines(cellAt(asgIx, t.id, day, slotIndex), ix)} />
                    </div>
                );
            })}
        </>
    );
}

function OwnerTables({ view }: { view: 'agent' | 'resource' }) {
    const st = useStore();
    const doc = st.doc;
    const ix = buildIx(doc);
    const starts = allLessonStarts(doc);
    const days = doc.specs[0] ? activeDays(doc.specs[0]) : [0, 1, 2, 3, 4];
    // 교사별: 담임(사람이 아님)은 목록에서 뺀다. 함께 수업으로 들어간 교사도 자기 표에 나오게 coAgentId 도 본다.
    const belongs = (a: Assignment, id: string) => view === 'agent'
        ? (a.agentId === id || a.coAgentId === id)
        : a.resourceId === id;
    const owners = (view === 'agent'
        ? doc.agents.filter((o) => o.id !== HOMEROOM_AGENT_ID)
        : doc.resources
    ).filter((o) => doc.assignments.some((a) => belongs(a, o.id)));
    if (owners.length === 0) return <p className="text-[13px] text-muted no-print">배치가 있는 {view === 'agent' ? '교사' : '특별실'}가 없습니다.</p>;
    return (
        <>
            {owners.map((o) => (
                <div key={o.id} className="break-inside-avoid">
                    <div className="text-[13px] font-medium mb-1">{o.name}</div>
                    <table className="print-table w-full border-collapse text-[12px] mb-2">
                        <thead><tr><th className="border border-line px-2 py-1 bg-panel2">시각</th>{days.map((d) => <th key={d} className="border border-line px-2 py-1 bg-panel2">{dayName(doc.specs[0], d)}</th>)}</tr></thead>
                        <tbody>
                            {starts.map((start) => (
                                <tr key={start}>
                                    <td className="border border-line px-2 py-1 text-muted">{start}</td>
                                    {days.map((d) => {
                                        const list = doc.assignments.filter((x) => belongs(x, o.id) && x.dayIndex === d && slotStartOf(doc, x) === start);
                                        return <td key={d} className="border border-line px-2 py-1 whitespace-pre-line">{cellLines(list, ix, view)}</td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </>
    );
}

function GridTable({ spec, cell }: { spec: TimetableSpec; cell: (day: number, slotIndex: number) => string }) {
    const days = activeDays(spec);
    const slots = assignableSlots(spec);
    return (
        <table className="print-table w-full border-collapse text-[12px] mb-2">
            <thead><tr><th className="border border-line px-2 py-1 bg-panel2">교시</th>{days.map((d) => <th key={d} className="border border-line px-2 py-1 bg-panel2">{dayName(spec, d)}</th>)}</tr></thead>
            <tbody>
                {slots.map((sl) => (
                    <tr key={sl.index}>
                        <td className="border border-line px-2 py-1 text-muted">{sl.label}</td>
                        {days.map((d) => <td key={d} className="border border-line px-2 py-1 whitespace-pre-line">{cell(d, sl.index)}</td>)}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
