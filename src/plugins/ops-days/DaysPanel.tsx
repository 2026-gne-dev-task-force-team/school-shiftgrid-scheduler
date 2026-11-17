import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Calendar } from '../calendar/contracts/calendar';
import { firstAcademicStore, readAcademic } from './academic';
import { getBundle, subscribeBundle } from '../../../shared/bundle/store.ts';
import { Button, Field, Icon, SectionHeader, TextInput, Toolbar, ViewHeader } from '../../pane-ui-system';
import { addChange, applyDaysOps, canApplyClassSubjects, CLASS_SUBJECTS_DENIED, delChange } from './ops';
import { daysFrame } from './import/daysFrame';
import { ClassImportView } from './import/ClassImportView';
import { demoDays, memoryDaysSource, saveClassSubjects, storageDaysSource, type DaysSource } from './source';
import type { DaysPart, DaysViewer } from './types';

const fallback = memoryDaysSource(demoDays());
const demoViewer: DaysViewer = { userId: 'u-a', roles: ['교사'] };

// 보기 상태(학사/불러오기)는 모듈에 둔다 — 창 폭에 따라 바깥이 이 화면을 다시 마운트해도 안 날아가게.
type DaysTab = 'days' | 'import';
let tabNow: DaysTab = 'days';
const tabSubs = new Set<() => void>();
const setTab = (t: DaysTab) => { tabNow = t; tabSubs.forEach((f) => f()); };
const subTab = (f: () => void) => { tabSubs.add(f); return () => { tabSubs.delete(f); }; };
export const resetDaysTab = () => setTab('days');

/** 학사 — 월(YYYY-MM) 고르면 그 달 일정·변경을 날짜순 목록으로 · 교사는 변경 넣기·내 것 지우기. */
export function DaysView({ source, viewer, initialMonth, newId, loadFile, host }: { host?: Pick<PluginHost, 'modules' | 'storage'>; source?: DaysSource; viewer?: DaysViewer; initialMonth?: string; newId?: () => string; loadFile?: (f: File) => Promise<Uint8Array> }) {
    const store = host?.storage;
    const src = useMemo(() => source ?? (store ? storageDaysSource(store, demoDays) : fallback), [source, store]);
    const v = viewer ?? demoViewer;
    const [month, setMonth] = useState(initialMonth ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7));
    const [part, setPart] = useState<DaysPart | null>(null);
    const tab = useSyncExternalStore(subTab, () => tabNow);
    const bundle = useSyncExternalStore(subscribeBundle, getBundle);   // 번들이 늦게 들어와도 시간 틀을 다시 뽑는다
    const [pendingDel, setPendingDel] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [f, setF] = useState({ date: `${month}-01`, classKey: '', period: '1', subject: '' });
    // 달력 약속이 있고 학사 저장소가 이미 있으면 일정·변경은 달력에서 읽는다(T-10fb). 없으면 옛 자료(source)로 그대로.
    const calendar = host?.modules.use<Calendar>('calendar') ?? null;
    const nodes = host?.modules.use<NodesApi>('nodes') ?? null;
    const [, bump] = useReducer((n: number) => n + 1, 0);
    useEffect(() => { const sub = nodes?.subscribe(bump); return () => { sub?.dispose(); }; }, [nodes]);
    const academic = calendar && nodes ? readAcademic(calendar, nodes, month) : null;
    const reload = async () => setPart(await src.load());
    useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const run = async (ops: ReturnType<typeof addChange>[]) => {
        const server = await src.load();
        const r = applyDaysOps(v, server, ops);
        if (r.errors.length > 0) setMsg(r.errors[0]);
        else { await src.save(r.next); setMsg('반영했습니다.'); }
        await reload();
    };
    const add = () => run([addChange({ id: newId ? newId() : crypto.randomUUID(), date: f.date, classKey: f.classKey, period: Number(f.period), subject: f.subject, note: '', createdBy: v.userId ?? '' })]);

    const events = (part?.calendar ?? []).filter((e) => e.date.startsWith(month) || e.endDate.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
    const changes = (part?.changes ?? []).filter((c) => c.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);

    if (tab === 'import') {
        return (
            <div className="h-full flex flex-col min-h-0">
                <Toolbar><Button variant="outline" onClick={() => setTab('days')}>학사로 돌아가기</Button></Toolbar>
                <div className="flex-1 min-h-0 overflow-auto">
                    <ClassImportView loadFile={loadFile} applyDenied={canApplyClassSubjects(v) ? undefined : CLASS_SUBJECTS_DENIED} frame={daysFrame(part, bundle)} current={part?.classSubjects ?? []} onApply={async (next) => { if (await saveClassSubjects(src, next, v)) return; await reload(); }} />
                </div>
            </div>
        );
    }

    if (academic && nodes) {
        const store = firstAcademicStore(nodes);
        return (
            <div className="h-full flex flex-col min-h-0">
                <ViewHeader icon={<Icon name="calendar" size={14} />} title="학사" />
                <Toolbar>
                    <Button variant="outline" onClick={() => setTab('import')}>담임 과목 불러오기</Button>
                    {store && <Button variant="outline" onClick={() => nodes.open(store)}>달력에서 고치기</Button>}
                </Toolbar>
                <div className="flex-1 min-h-0 overflow-auto flex flex-col">
                    <div className="p-pad"><Field label="월"><TextInput value={month} onChange={(e) => setMonth(e.target.value)} placeholder="2026-11" /></Field></div>
                    <SectionHeader title={`학사 일정 ${academic.filter((r) => !r.timetable).length}건`} />
                    <div className="p-pad flex flex-col gap-1">
                        {academic.filter((r) => !r.timetable).map((r) => <div key={r.id} className="text-small">{r.date} [{r.kind || '일정'}] {r.name}</div>)}
                    </div>
                    <SectionHeader title={`시간표 변경 ${academic.filter((r) => r.timetable).length}건`} />
                    <div className="p-pad flex flex-col gap-1">
                        {academic.filter((r) => r.timetable).map((r) => <div key={r.id} className="text-small">{r.date} {r.name}</div>)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col min-h-0">
            <ViewHeader icon={<Icon name="calendar" size={14} />} title="학사" />
            <Toolbar>
                <Button variant="outline" onClick={() => setTab('import')}>담임 과목 불러오기</Button>
            </Toolbar>
            <div className="flex-1 min-h-0 overflow-auto flex flex-col">
                <div className="p-pad flex flex-col gap-2">
                    <Field label="월"><TextInput value={month} onChange={(e) => setMonth(e.target.value)} placeholder="2026-11" /></Field>
                    {msg && <p role="alert" className="text-small">{msg}</p>}
                </div>
                <SectionHeader title={`학사 일정 ${events.length}건`} />
                <div className="p-pad flex flex-col gap-1">
                    {events.map((e) => <div key={e.id} className="text-small">{e.date} {e.kind === 'all' ? '[휴업]' : '[행사]'} {e.title}</div>)}
                </div>
                <SectionHeader title={`시간표 변경 ${changes.length}건`} />
                <div className="p-pad flex flex-col gap-2">
                    {changes.map((c) => (
                        <div key={c.id} className="flex gap-2 items-center text-small">
                            <span>{c.date} {c.classKey} {c.period}교시 {c.subject}</span>
                            {pendingDel === c.id
                                ? (
                                    <>
                                        <span>정말 지울까요?</span>
                                        <Button variant="solid" tone="danger" onClick={() => { setPendingDel(null); void run([delChange(c.id)]); }}>{`${c.classKey} ${c.period}교시 지우기 확인`}</Button>
                                        <Button variant="outline" onClick={() => setPendingDel(null)}>지우기 취소</Button>
                                    </>
                                )
                                : <Button variant="outline" tone="danger" onClick={() => setPendingDel(c.id)}>{`${c.classKey} ${c.period}교시 지우기`}</Button>}
                        </div>
                    ))}
                </div>
                <SectionHeader title="변경 넣기" />
                <div className="p-pad flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                        <Field label="날짜"><TextInput value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
                        <Field label="반"><TextInput value={f.classKey} onChange={(e) => setF({ ...f, classKey: e.target.value })} /></Field>
                        <Field label="교시"><TextInput value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
                        <Field label="과목"><TextInput value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
                    </div>
                    <Button variant="solid" tone="accent" onClick={() => void add()}>변경 넣기</Button>
                </div>
            </div>
        </div>
    );
}

export function DaysPanel({ host }: { host?: Pick<PluginHost, 'modules' | 'storage'> }) { return <DaysView host={host} />; }
