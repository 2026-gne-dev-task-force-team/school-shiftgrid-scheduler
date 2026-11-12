import { useEffect, useState } from 'react';
import { Badge, Button, EmptyState, Field, TextInput } from '../../pane-ui-system';
import { getSlotSource, getViewer, type SlotSource, type SubSlotRow, type Viewer } from './list';
import { isManager } from './list';
import { adminOptions, runAdmin, type AdminAction } from './admin';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const LABEL: Record<AdminAction, string> = { delete: '삭제', revert: '확정 되돌리기', assign: '지정', force: '강제 지정' };

/** 보결 관리 — 관리 역할만. 되돌릴 수 없는 조작은 줄 안에서 「정말?」 확인을 거친다(브라우저 confirm 없음). */
export function AdminView({ source, viewer, date: initDate, now = today }: { source?: SlotSource; viewer?: Viewer; date?: string; now?: () => string }) {
    const src = source ?? getSlotSource();
    const v = viewer ?? getViewer();
    const [date, setDate] = useState(initDate ?? now());
    const [day, setDay] = useState<SubSlotRow[] | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [pending, setPending] = useState<{ rowId: string; action: AdminAction; prompt: string; updatedAt: string } | null>(null);
    const [target, setTarget] = useState('');
    const reload = async () => setDay(await src.loadSlots(date));
    useEffect(() => { setPending(null); void reload(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!v.loggedIn || !isManager(v)) return <EmptyState icon="ban" title="관리 권한이 없습니다" description="관리자·교감·교무·보결관리자만 쓸 수 있는 화면입니다." />;
    if (day === null) return <p className="p-4 text-small text-muted">불러오는 중…</p>;

    const run = async (row: SubSlotRow, action: AdminAction, confirmed: boolean) => {
        const name = target.trim();
        const r = await runAdmin(src, action, row.id, date, v, {
            today: now(), now: () => new Date().toISOString(), confirmed, expectUpdatedAt: row.updatedAt,
            target: name ? { ref: name, name } : undefined,
        });
        if (!r.ok && r.needConfirm) { setPending({ rowId: row.id, action, prompt: r.prompt, updatedAt: row.updatedAt }); setMsg(null); return; }
        setPending(null);
        setMsg(r.ok ? `${LABEL[action]} 처리했습니다.` : r.message);
        await reload();
    };
    const rows = day.filter((r) => r.projectId === v.projectId);
    return (
        <div className="p-4 max-w-xl flex flex-col gap-2 text-small">
            <Field label="날짜"><TextInput value={date} onChange={(e) => setDate(e.target.value)} placeholder="2026-11-12" /></Field>
            <Field label="지정할 사람" hint="지정·강제 지정에만 씁니다."><TextInput value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
            {msg && <p role="status">{msg}</p>}
            {rows.length === 0 && <p className="text-muted">이 날 보결이 없습니다.</p>}
            {rows.map((row) => {
                const opts = adminOptions(row, v, now());
                const mine = pending?.rowId === row.id ? pending : null;
                return (
                    <div key={row.id} className="border-b pb-2 flex flex-col gap-1">
                        <p>{row.trackName} · {row.body.absentName} <Badge tone={row.status === '확정' ? 'neutral' : 'danger'}>{row.status}</Badge>{row.take && ` · ${row.take.takerName}`}</p>
                        {row.date < now() && opts.length === 0 && <p className="text-muted">지난 날 보결은 관리자만 처리할 수 있습니다.</p>}
                        {mine ? (
                            <div role="alertdialog" className="flex flex-col gap-1">
                                <p>{mine.prompt}</p>
                                <div className="flex gap-2">
                                    <Button variant="solid" tone="danger" onClick={() => void run(row, mine.action, true)}>확인</Button>
                                    <Button variant="outline" tone="neutral" onClick={() => setPending(null)}>취소</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-2 flex-wrap">
                                {opts.map((a) => <Button key={a} variant="outline" tone={a === 'delete' ? 'danger' : 'neutral'} onClick={() => void run(row, a, false)}>{LABEL[a]}</Button>)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export function AdminPanel() { return <AdminView />; }
