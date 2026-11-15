import { useEffect, useState } from 'react';
import { Button, Field, Select, TextInput } from '../../../pane-ui-system';
import { addExc, applyAuxOps, closeMonth, delExc, reopenMonth } from '../ops';
import { defaultAuxSource, type AuxSource } from '../source';
import type { AuxExceptionKind, AuxPart, AuxViewer } from '../types';
import { monthTotals } from './total';

const demoViewer: AuxViewer = { userId: 'u-a', role: '근태담당' };
const KINDS: AuxExceptionKind[] = ['결근', '지각', '조퇴', '추가', '정정'];

/** 월 정산 최소 꼴 — 보조별 합계(정정 후 따로) · 마감/해제 · 예외 더하기. */
export function MonthView({ source, viewer, initialYm, newId }: { source?: AuxSource; viewer?: AuxViewer; initialYm?: string; newId?: () => string }) {
    const src = source ?? defaultAuxSource;
    const v = viewer ?? demoViewer;
    const [ym, setYm] = useState(initialYm ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7));
    const [part, setPart] = useState<AuxPart | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [pendingDel, setPendingDel] = useState<string | null>(null);
    const [f, setF] = useState({ staffId: '', date: `${ym}-01`, kind: '결근' as AuxExceptionKind, amount: '-60', note: '' });
    const id = () => (newId ? newId() : crypto.randomUUID());
    const reload = async () => setPart(await src.load());
    useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const run = async (ops: Parameters<typeof applyAuxOps>[2]) => {
        const r = applyAuxOps(v, await src.load(), ops, src.lessonsOn);
        if (r.errors.length > 0) setMsg(r.errors[0]);
        else { await src.save(r.next); setMsg('반영했습니다.'); }
        await reload();
    };
    const staff = part?.staff ?? [];
    const nameOf = (sid: string) => staff.find((s) => s.id === sid)?.name ?? sid;
    const rows = part ? monthTotals(part, ym) : [];
    const excs = (part?.exceptions ?? []).filter((e) => e.date.startsWith(`${ym}-`));
    const closedIds = new Set((part?.monthClose ?? []).filter((m) => m.ym === ym).map((m) => m.staffId));
    return (
        <div className="p-4 max-w-xl flex flex-col gap-3">
            {msg && <p role="alert" className="text-small">{msg}</p>}
            <Field label="년월"><TextInput value={ym} onChange={(e) => setYm(e.target.value)} placeholder="2026-10" /></Field>
            {rows.map((r) => (
                <div key={r.staffId} className="flex flex-wrap gap-2 items-center text-small">
                    <span>{nameOf(r.staffId)} 근무 {r.work} · 예외 {r.exceptions} · 정정 후 {r.after}{r.closed ? ' [마감]' : ''}</span>
                    {r.closed
                        ? <Button variant="outline" onClick={() => void run([reopenMonth(`${r.staffId}:${ym}`)])}>{`${nameOf(r.staffId)} 마감 해제`}</Button>
                        : <Button variant="outline" onClick={() => void run([closeMonth({ id: `${r.staffId}:${ym}`, staffId: r.staffId, ym })])}>{`${nameOf(r.staffId)} 마감`}</Button>}
                </div>
            ))}
            <h3 className="text-small">예외 {excs.length}건</h3>
            {excs.map((e) => {
                const locked = closedIds.has(e.staffId);
                return (
                    <div key={e.id} data-testid="exc-row" className="flex flex-wrap gap-2 items-center text-small">
                        <span className="min-w-0">{`${nameOf(e.staffId)} ${e.date} ${e.kind} ${e.amount}분${e.note ? ` · ${e.note}` : ''}`}</span>
                        {locked && <span>마감된 달이라 뺄 수 없습니다.</span>}
                        {!locked && pendingDel !== e.id && <Button variant="outline" onClick={() => setPendingDel(e.id)}>{`${nameOf(e.staffId)} ${e.date} ${e.kind} 빼기`}</Button>}
                        {!locked && pendingDel === e.id && (
                            <>
                                <span>정말 뺄까요?</span>
                                <Button variant="solid" tone="danger" onClick={() => { setPendingDel(null); void run([delExc(e.id)]); }}>{`${nameOf(e.staffId)} ${e.date} ${e.kind} 빼기 확인`}</Button>
                                <Button variant="outline" onClick={() => setPendingDel(null)}>빼기 취소</Button>
                            </>
                        )}
                    </div>
                );
            })}
            <h3 className="text-small">예외 더하기</h3>
            <div data-testid="form-row" className="flex flex-wrap gap-2">
                <Field label="보조" className="min-w-0"><Select value={f.staffId || (staff[0]?.id ?? '')} onChange={(e) => setF({ ...f, staffId: e.target.value })} options={staff.map((x) => ({ value: x.id, label: x.name }))} /></Field>
                <Field label="날짜" className="min-w-0"><TextInput value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
                <Field label="종류" className="min-w-0"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as AuxExceptionKind })} options={KINDS.map((k) => ({ value: k, label: k }))} /></Field>
                <Field label="양(분)" className="min-w-0"><TextInput value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
                <Field label="사유" className="min-w-0"><TextInput value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            </div>
            <Button variant="solid" tone="accent" onClick={() => void run([addExc({ id: id(), staffId: f.staffId || (staff[0]?.id ?? ''), date: f.date, kind: f.kind, amount: Number(f.amount), note: f.note })])}>예외 넣기</Button>
        </div>
    );
}
