import { useEffect, useState } from 'react';
import { Button, Field, TextInput } from '../../pane-ui-system';
import { addChange, applyDaysOps, delChange } from './ops';
import { demoDays, memoryDaysSource, type DaysSource } from './source';
import type { DaysPart, DaysViewer } from './types';

const fallback = memoryDaysSource(demoDays());
const demoViewer: DaysViewer = { userId: 'u-a', role: '교사' };

/** 학사 — 월(YYYY-MM) 고르면 그 달 일정·변경을 날짜순 목록으로 · 교사는 변경 넣기·내 것 지우기. */
export function DaysView({ source, viewer, initialMonth, newId }: { source?: DaysSource; viewer?: DaysViewer; initialMonth?: string; newId?: () => string }) {
    const src = source ?? fallback;
    const v = viewer ?? demoViewer;
    const [month, setMonth] = useState(initialMonth ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7));
    const [part, setPart] = useState<DaysPart | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [f, setF] = useState({ date: `${month}-01`, classKey: '', period: '1', subject: '' });
    const reload = async () => setPart(await src.load());
    useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const run = async (ops: ReturnType<typeof addChange>[]) => {
        const server = await src.load();
        const r = applyDaysOps(v, server, ops);
        if (r.errors.length > 0) setMsg(r.errors[0]);
        else { await src.save(r.next); setMsg('반영했습니다.'); }
        await reload();
    };
    const add = () => run([addChange({ id: newId ? newId() : crypto.randomUUID(), date: f.date, classKey: f.classKey, period: Number(f.period), subject: f.subject, note: '', createdBy: v.userId })]);

    const events = (part?.calendar ?? []).filter((e) => e.date.startsWith(month) || e.endDate.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
    const changes = (part?.changes ?? []).filter((c) => c.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);

    return (
        <div className="p-4 max-w-xl flex flex-col gap-3">
            <Field label="월"><TextInput value={month} onChange={(e) => setMonth(e.target.value)} placeholder="2026-11" /></Field>
            {msg && <p role="alert" className="text-small">{msg}</p>}
            <h3 className="text-small">학사 일정 {events.length}건</h3>
            {events.map((e) => <div key={e.id} className="text-small">{e.date} {e.kind === 'all' ? '[휴업]' : '[행사]'} {e.title}</div>)}
            <h3 className="text-small">시간표 변경 {changes.length}건</h3>
            {changes.map((c) => (
                <div key={c.id} className="flex gap-2 items-center text-small">
                    <span>{c.date} {c.classKey} {c.period}교시 {c.subject}</span>
                    <Button variant="ghost" onClick={() => void run([delChange(c.id)])}>{`${c.classKey} ${c.period}교시 지우기`}</Button>
                </div>
            ))}
            <h3 className="text-small">변경 넣기</h3>
            <div className="flex gap-2">
                <Field label="날짜"><TextInput value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
                <Field label="반"><TextInput value={f.classKey} onChange={(e) => setF({ ...f, classKey: e.target.value })} /></Field>
                <Field label="교시"><TextInput value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
                <Field label="과목"><TextInput value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
            </div>
            <Button variant="solid" tone="accent" onClick={() => void add()}>변경 넣기</Button>
        </div>
    );
}

export function DaysPanel() { return <DaysView />; }
