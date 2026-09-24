/** 출력 — 전담별/반별/특별실별 인쇄용 표(흑백에서도 읽히게) · 인쇄 · 엑셀 · JSON */
import { useState } from 'react';
import { useStore } from '../../store/store';
import { platform } from '../../platform';
import { exportTimetableWorkbook } from '../../io/excel';
import type { Assignment, TimetableSpec } from '../../types/schema';
import { indexBy, assignableSlots, activeDays, dayName, allLessonStarts, slotStartOf, cellKey, indexAssignments } from '../lib';
import { Button, Info } from '../parts/ui';

type View = 'track' | 'agent' | 'resource';

export default function ExportScreen() {
    const st = useStore();
    const { doc } = st;
    const [view, setView] = useState<View>('track');

    const exportExcel = async () => {
        const bytes = st.runEngine('엑셀 만들기', () => exportTimetableWorkbook(doc));
        if (bytes) await st.runEngineAsync('엑셀 내보내기', () =>
            platform.exportFile(`${doc.meta.name || '시간표'}.xlsx`, bytes,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    };
    const exportJson = async () => {
        await st.runEngineAsync('JSON 저장', () =>
            platform.exportFile(`${doc.meta.name || '시간표'}.shiftgrid.json`, JSON.stringify(doc, null, 1), 'application/json'));
    };

    return (
        <div className="p-4">
            <div className="no-print flex items-center gap-2 flex-wrap mb-3">
                <div className="flex rounded-md overflow-hidden border border-line">
                    {(['track', 'agent', 'resource'] as View[]).map((v) => (
                        <button key={v} onClick={() => setView(v)}
                            className={`px-3 py-1.5 text-[12px] ${view === v ? 'bg-accent text-white' : 'bg-panel2 text-muted hover:text-text'}`}>
                            {v === 'track' ? '반별' : v === 'agent' ? '전담별' : '특별실별'}
                        </button>
                    ))}
                </div>
                <Button icon="printer" onClick={() => void platform.print()}>인쇄</Button>
                <Button icon="download" onClick={() => void exportExcel()}>엑셀로 내보내기</Button>
                <Button icon="save" onClick={() => void exportJson()}>JSON 저장</Button>
                <Info lines={[
                    '완성된 시간표를 반별·전담별·특별실별로 인쇄하거나 파일로 내보냅니다.',
                    '흑백으로 인쇄해도 읽히도록 색 없이 글자와 표로만 나타냅니다.',
                    '엑셀·JSON 은 다른 프로그램에서 다시 여는 용도입니다.',
                ]} />
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

function cellLines(a: Assignment | undefined, ix: ReturnType<typeof buildIx>, owner?: View): string {
    if (!a) return '';
    const act = a.activityId ? ix.activities.get(a.activityId)?.name : a.label;
    const agent = a.agentId ? ix.agents.get(a.agentId)?.name : undefined;
    const res = a.resourceId ? ix.resources.get(a.resourceId)?.name : undefined;
    const track = ix.tracks.get(a.trackId)?.name;
    const sub = owner === 'agent' ? [track, res] : owner === 'resource' ? [track, agent] : [agent, res];
    return [act, sub.filter(Boolean).join(' ')].filter(Boolean).join('\n');
}
function buildIx(doc: ReturnType<typeof useStore>['doc']) {
    return { agents: indexBy(doc.agents), activities: indexBy(doc.activities), resources: indexBy(doc.resources), tracks: indexBy(doc.tracks) };
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
                return (
                    <div key={t.id} className="break-inside-avoid">
                        <div className="text-[13px] font-medium mb-1">{t.name}</div>
                        <GridTable spec={spec}
                            cell={(day, slotIndex) => cellLines(asgIx.get(cellKey(t.id, day, slotIndex)), ix)} />
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
    const owners = (view === 'agent' ? doc.agents : doc.resources).filter((o) =>
        doc.assignments.some((a) => (view === 'agent' ? a.agentId : a.resourceId) === o.id));
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
                                        const a = doc.assignments.find((x) => (view === 'agent' ? x.agentId : x.resourceId) === o.id && x.dayIndex === d && slotStartOf(doc, x) === start);
                                        return <td key={d} className="border border-line px-2 py-1 whitespace-pre-line">{cellLines(a, ix, view)}</td>;
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
