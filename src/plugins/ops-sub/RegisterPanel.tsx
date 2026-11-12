import { useState } from 'react';
import { Button, Field, TextInput } from '../../pane-ui-system';
import { getSlotSource, getViewer, type SlotSource } from './list';
import { registerSlot, type RegisterCtx, type RegisterInput, type RegisterResult } from './register';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const blank = (): RegisterInput => ({ date: today(), start: '', end: '', trackName: '', absentRef: '', absentName: '', reason: '', memo: '' });

const liveCtx = (): RegisterCtx => {
    const v = getViewer();
    return { projectId: v.projectId, userId: v.userId ?? '', userName: '', now: () => new Date().toISOString(), newId: () => crypto.randomUUID() };
};

/** 보결 등록 — 입력 칸 · 「등록」 · 같은 칸이 있으면 인라인 되묻기 줄(덮을까요? 덮어쓰기/취소). */
export function RegisterView({ source, ctx, initial }: { source?: SlotSource; ctx?: RegisterCtx; initial?: Partial<RegisterInput> }) {
    const [form, setForm] = useState<RegisterInput>({ ...blank(), ...initial });
    const [ask, setAsk] = useState<string | null>(null);
    const [msgs, setMsgs] = useState<string[]>([]);
    const [done, setDone] = useState<string | null>(null);
    const set = (k: keyof RegisterInput) => (v: string) => { setForm((f) => ({ ...f, [k]: v })); setAsk(null); setDone(null); };

    const submit = async (overwrite: boolean) => {
        const input = { ...form, absentRef: form.absentRef || (form.trackName ? `homeroom:${form.trackName}` : '') };
        const r: RegisterResult = await registerSlot(source ?? getSlotSource(), input, ctx ?? liveCtx(), { overwrite });
        setMsgs([]); setAsk(null); setDone(null);
        if ('needsConfirm' in r) setAsk(r.message);
        else if (r.ok) setDone(r.replaced ? '덮어서 등록했습니다.' : '등록했습니다.');
        else setMsgs('errors' in r ? r.errors : [r.message]);
    };

    return (
        <div className="p-4 max-w-xl flex flex-col gap-3">
            <Field label="날짜"><TextInput value={form.date} onChange={(e) => set('date')(e.target.value)} placeholder="2026-11-12" /></Field>
            <div className="flex gap-2">
                <Field label="시작"><TextInput value={form.start} onChange={(e) => set('start')(e.target.value)} placeholder="09:40" /></Field>
                <Field label="끝"><TextInput value={form.end} onChange={(e) => set('end')(e.target.value)} placeholder="10:20" /></Field>
            </div>
            <Field label="반"><TextInput value={form.trackName} onChange={(e) => set('trackName')(e.target.value)} placeholder="1-1" /></Field>
            <Field label="빠지는 사람" hint="비워 두면 그 반 담임으로 올립니다."><TextInput value={form.absentName} onChange={(e) => set('absentName')(e.target.value)} /></Field>
            <Field label="사유"><TextInput value={form.reason} onChange={(e) => set('reason')(e.target.value)} /></Field>
            <Field label="메모"><TextInput value={form.memo} onChange={(e) => set('memo')(e.target.value)} /></Field>
            {msgs.map((m) => <p key={m} role="alert" className="text-small text-bad">{m}</p>)}
            {ask && (
                <div role="alertdialog" className="text-small flex flex-col gap-2 rounded-ctl border border-line p-2">
                    <p>{ask}</p>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setAsk(null)}>취소</Button>
                        <Button variant="solid" tone="danger" onClick={() => void submit(true)}>덮어쓰기</Button>
                    </div>
                </div>
            )}
            {done && <p className="text-small">{done}</p>}
            <div><Button variant="solid" tone="accent" onClick={() => void submit(false)}>등록</Button></div>
        </div>
    );
}

export function RegisterPanel() { return <RegisterView />; }
