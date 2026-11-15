import { useEffect, useState } from 'react';
import { toHHMM, toMin } from '../../../shared/clock.ts';
import { Button, Field, Select, TextInput } from '../../pane-ui-system';
import { addDay, addStaff, applyAuxOps, delDay, deactivateStaff, judgeDay, reassignNeededCount } from './ops';
import { demoAux, memoryAuxSource, type AuxSource } from './source';
import type { AuxPart, AuxViewer } from './types';

const fallback = memoryAuxSource(demoAux());
const demoViewer: AuxViewer = { userId: 'u-a', role: '근태담당' };
const todayKst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

/** 근태 — 명부 목록 + 날짜 하나의 배정(재배정 필요 표시) · 근태담당만 고친다. */
export function AuxView({ source, viewer, initialDate, newId }: { source?: AuxSource; viewer?: AuxViewer; initialDate?: string; newId?: () => string }) {
    const src = source ?? fallback;
    const v = viewer ?? demoViewer;
    const [date, setDate] = useState(initialDate ?? todayKst());
    const [part, setPart] = useState<AuxPart | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [f, setF] = useState({ staffId: '', classKey: '', start: '09:00' });
    const id = () => (newId ? newId() : crypto.randomUUID());
    const reload = async () => setPart(await src.load());
    useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const run = async (ops: Parameters<typeof applyAuxOps>[2]) => {
        const server = await src.load();
        const r = applyAuxOps(v, server, ops, src.lessonsOn);
        if (r.errors.length > 0) setMsg(r.errors[0]);
        else { await src.save(r.next); setMsg('반영했습니다.'); }
        await reload();
    };
    const assign = () => {
        const startMin = toMin(f.start);
        return run([addDay({ id: id(), staffId: f.staffId || (part?.staff[0]?.id ?? ''), date, startMin, endMin: startMin + 40, classKey: f.classKey, source: 'manual' })]);
    };

    const staff = part?.staff ?? [];
    const nameOf = (sid: string) => staff.find((s) => s.id === sid)?.name ?? sid;
    const judged = part ? judgeDay(part, date, src.lessonsOn(date)).sort((a, b) => a.startMin - b.startMin) : [];
    const badge = part ? reassignNeededCount(part, todayKst(), src.lessonsOn) : 0;

    return (
        <div className="p-4 max-w-xl flex flex-col gap-3">
            <p className="text-small" data-testid="aux-badge">14일 안 재배정 필요 {badge}건</p>
            {msg && <p role="alert" className="text-small">{msg}</p>}
            <h3 className="text-small">명부 {staff.length}명</h3>
            {staff.map((s) => (
                <div key={s.id} className="flex gap-2 items-center text-small">
                    <span>{s.name} ({s.kind}){s.active ? '' : ' [쉼]'}</span>
                    {s.active && <Button variant="ghost" onClick={() => void run([deactivateStaff(s)])}>{`${s.name} 쉬게 하기`}</Button>}
                </div>
            ))}
            <div className="flex gap-2">
                <Field label="새 보조 이름"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Button variant="solid" tone="accent" onClick={() => void run([addStaff({ id: id(), name, kind: '기타', unit: 'period', active: true, allowedActivities: [], targetTracks: [] })])}>명부에 넣기</Button>
            </div>
            <Field label="날짜"><TextInput value={date} onChange={(e) => setDate(e.target.value)} placeholder="2026-11-19" /></Field>
            <h3 className="text-small">{date} 배정 {judged.length}건</h3>
            {judged.map((j) => (
                <div key={`${j.from}:${j.staffId}:${j.startMin}`} className="flex gap-2 items-center text-small">
                    <span>{toHHMM(j.startMin)} {nameOf(j.staffId)} → {j.classKey}{j.ok ? '' : ` [재배정 필요: ${j.reason}]`}</span>
                    {j.from === 'day' && <Button variant="ghost" onClick={() => void run([delDay(part?.day.find((d) => d.date === date && d.staffId === j.staffId && d.startMin === j.startMin)?.id ?? '')])}>{`${nameOf(j.staffId)} ${toHHMM(j.startMin)} 빼기`}</Button>}
                </div>
            ))}
            <h3 className="text-small">이 날 배정하기</h3>
            <div className="flex gap-2">
                <Field label="보조">
                    <Select value={f.staffId || (staff[0]?.id ?? '')} onChange={(e) => setF({ ...f, staffId: e.target.value })} options={staff.filter((x) => x.active).map((x) => ({ value: x.id, label: x.name }))} />
                </Field>
                <Field label="반"><TextInput value={f.classKey} onChange={(e) => setF({ ...f, classKey: e.target.value })} /></Field>
                <Field label="시작"><TextInput value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            </div>
            <Button variant="solid" tone="accent" onClick={() => void assign()}>배정하기</Button>
        </div>
    );
}

export function AuxPanel() { return <AuxView />; }
