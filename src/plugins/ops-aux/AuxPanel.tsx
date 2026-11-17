import { useEffect, useState } from 'react';
import { toHHMM, toMin } from '../../../shared/clock.ts';
import { Button, Field, Select, TextInput } from '../../pane-ui-system';
import { addDay, addStaff, applyAuxOps, delDay, deactivateStaff, judgeDay, reactivateStaff, reassignNeededCount } from './ops';
import { MonthView } from './month/MonthPanel';
import { defaultAuxSource, type AuxSource } from './source';
import type { AuxPart, AuxViewer } from './types';
import type { Staff } from '../staff/contracts/staff';
import { readAuxStaff } from './migrate';
import { onAssignTabRequest } from './auxTab';

const demoViewer: AuxViewer = { userId: 'u-a', roles: ['근태담당'] };
const todayKst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

/**
 * 근태 — 명부 목록 + 날짜 하나의 배정(재배정 필요 표시) · 근태담당만 고친다.
 *   🔴 R15 — staff(교직원 명단) 약속이 오면 명부는 거기서 읽는다(구분 = 보조인력 · 읽는 보기). 보조인력이 하나도 없으면 옛 근태 명부를 보인다.
 *     staff 로 읽는 동안 명부 고치기(쉬게 하기·되돌리기·넣기)는 교직원 명단에서 한다 — 여기선 감춘다.
 */
export function AuxView({ source, viewer, initialDate, newId, staff: staffApi }: { source?: AuxSource; viewer?: AuxViewer; initialDate?: string; newId?: () => string; staff?: Staff }) {
    const src = source ?? defaultAuxSource;
    const v = viewer ?? demoViewer;
    const [date, setDate] = useState(initialDate ?? todayKst());
    const [rawPart, setPart] = useState<AuxPart | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [pendingRest, setPendingRest] = useState<string | null>(null);
    const [f, setF] = useState({ staffId: '', classKey: '', start: '09:00' });
    const id = () => (newId ? newId() : crypto.randomUUID());
    const viewStaff = staffApi ? readAuxStaff(staffApi) : [];
    const fromStaff = viewStaff.length > 0;
    const withStaff = (p: AuxPart): AuxPart => (fromStaff ? { ...p, staff: viewStaff } : p);
    const part = rawPart ? withStaff(rawPart) : null;
    const reload = async () => setPart(await src.load());
    useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // 번들이 화면보다 늦게 들어와도(기동 restore) 수업 칸 기준 판정을 다시 그린다.
    const [, bump] = useState(0);
    useEffect(() => src.subscribe?.(() => bump((n) => n + 1)), [src]);
    useEffect(() => { const d = staffApi?.onChange(() => bump((n) => n + 1)); return () => d?.dispose(); }, [staffApi]);

    const run = async (ops: Parameters<typeof applyAuxOps>[2]) => {
        const stored = await src.load();
        const r = applyAuxOps(v, withStaff(stored), ops, src.lessonsOn);
        if (r.errors.length > 0) setMsg(r.errors[0]);
        else { await src.save(fromStaff ? { ...r.next, staff: stored.staff } : r.next); setMsg('반영했습니다.'); } // staff 로 읽는 동안 옛 명부 칸은 건드리지 않는다
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
                <div key={s.id} className="flex flex-wrap gap-2 items-center text-small">
                    <span>{s.name} ({s.kind}){s.active ? '' : ' [쉼]'}</span>
                    {!fromStaff && s.active && pendingRest !== s.id && <Button variant="outline" tone="danger" onClick={() => setPendingRest(s.id)}>{`${s.name} 쉬게 하기`}</Button>}
                    {!fromStaff && s.active && pendingRest === s.id && (
                        <>
                            <span>정말 쉬게 할까요?</span>
                            <Button variant="solid" tone="danger" onClick={() => { setPendingRest(null); void run([deactivateStaff(s)]); }}>{`${s.name} 쉬게 하기 확인`}</Button>
                            <Button variant="outline" onClick={() => setPendingRest(null)}>쉬게 하기 취소</Button>
                        </>
                    )}
                    {!fromStaff && !s.active && <Button variant="outline" onClick={() => void run([reactivateStaff(s)])}>{`${s.name} 되돌리기`}</Button>}
                </div>
            ))}
            {fromStaff && <p className="text-small">명부는 교직원 명단(보조인력)에서 고칩니다.</p>}
            {!fromStaff && <div data-testid="form-row" className="flex flex-wrap gap-2 items-end">
                <Field label="새 보조 이름" className="min-w-0"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Button variant="solid" tone="accent" onClick={() => void run([addStaff({ id: id(), name, kind: '기타', unit: 'period', active: true, allowedActivities: [], targetTracks: [] })])}>명부에 넣기</Button>
            </div>}
            <Field label="날짜"><TextInput value={date} onChange={(e) => setDate(e.target.value)} placeholder="2026-11-19" /></Field>
            <h3 className="text-small">{date} 배정 {judged.length}건</h3>
            {judged.map((j) => (
                <div key={`${j.from}:${j.staffId}:${j.startMin}`} className="flex gap-2 items-center text-small">
                    <span>{toHHMM(j.startMin)} {nameOf(j.staffId)} → {j.classKey}{j.ok ? '' : ` [재배정 필요: ${j.reason}]`}</span>
                    {j.from === 'day' && <Button variant="outline" onClick={() => void run([delDay(part?.day.find((d) => d.date === date && d.staffId === j.staffId && d.startMin === j.startMin)?.id ?? '')])}>{`${nameOf(j.staffId)} ${toHHMM(j.startMin)} 빼기`}</Button>}
                </div>
            ))}
            <h3 className="text-small">이 날 배정하기</h3>
            <div data-testid="form-row" className="flex flex-wrap gap-2">
                <Field label="보조" className="min-w-0">
                    <Select value={f.staffId || (staff[0]?.id ?? '')} onChange={(e) => setF({ ...f, staffId: e.target.value })} options={staff.filter((x) => x.active).map((x) => ({ value: x.id, label: x.name }))} />
                </Field>
                <Field label="반" className="min-w-0"><TextInput value={f.classKey} onChange={(e) => setF({ ...f, classKey: e.target.value })} /></Field>
                <Field label="시작" className="min-w-0"><TextInput value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            </div>
            <Button variant="solid" tone="accent" onClick={() => void assign()}>배정하기</Button>
        </div>
    );
}

/** 탭 둘 — 배정(AuxView) · 월 정산(MonthView). */
export function AuxPanel({ source, viewer, staff }: { source?: AuxSource; viewer?: AuxViewer; staff?: Staff } = {}) {
    const [tab, setTab] = useState<'assign' | 'month'>('assign');
    useEffect(() => onAssignTabRequest(() => setTab('assign')), []);
    return (
        <div>
            <div className="flex gap-2 px-4 pt-3">
                <Button variant={tab === 'assign' ? 'solid' : 'ghost'} onClick={() => setTab('assign')}>배정</Button>
                <Button variant={tab === 'month' ? 'solid' : 'ghost'} onClick={() => setTab('month')}>월 정산</Button>
            </div>
            {tab === 'assign' ? <AuxView source={source} viewer={viewer} staff={staff} /> : <MonthView source={source} viewer={viewer} />}
        </div>
    );
}
