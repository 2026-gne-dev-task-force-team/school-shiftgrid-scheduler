import { useEffect, useState } from 'react';
import { Badge, Button, EmptyState } from '../../pane-ui-system';
import { getSlotSource, getViewer, type SlotSource, type SubSlotRow, type Viewer } from './list';
import { buildDetail, cancelTake, takeSlot, useSelection } from './detail';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

/** 보결 상세 — 줄 정보 · 「맡기」 · 실패하면 한 줄 안내(이미 맡음 등) 후 다시 불러온다. */
export function DetailView({ source, viewer, date, rowId, now = today }: { source?: SlotSource; viewer?: Viewer; date: string; rowId: string; now?: () => string }) {
    const src = source ?? getSlotSource();
    const v = viewer ?? getViewer();
    const [day, setDay] = useState<SubSlotRow[] | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const reload = async () => setDay(await src.loadSlots(date));
    useEffect(() => { void reload(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

    if (day === null) return <p className="p-4 text-small text-muted">불러오는 중…</p>;
    const row = day.find((r) => r.id === rowId);
    const d = row ? buildDetail(row, v, now(), day) : null;
    if (!d) return <EmptyState icon="ban" title="보결을 볼 수 없습니다" description="없어졌거나 볼 수 있는 범위 밖입니다." />;

    const take = async () => {
        const r = await takeSlot(src, rowId, date, v, { today: now(), now: () => new Date().toISOString(), takerName: v.personRef ?? '', expectUpdatedAt: row?.updatedAt });
        setMsg(r.ok ? '맡았습니다.' : r.message);
        await reload();
    };
    const cancel = async () => {
        const r = await cancelTake(src, rowId, date, v, { today: now(), now: () => new Date().toISOString(), expectUpdatedAt: row?.updatedAt });
        setMsg(r.ok ? '맡기를 취소했습니다.' : r.message);
        await reload();
    };
    const b = d.row.body;
    return (
        <div className="p-4 max-w-xl flex flex-col gap-2 text-small">
            <h3>{d.row.date} {d.timeText} · {d.row.trackName} <Badge tone={d.row.status === '확정' ? 'neutral' : 'danger'}>{d.row.status}</Badge></h3>
            <p>{d.absentKind} 결근 · {b.absentName}</p>
            <p>사유 {b.reason || '-'}{b.memo && ` · 메모 ${b.memo}`}</p>
            <p>올린 이 {b.registeredByName}</p>
            {d.row.take && <p>맡은 이 {d.row.take.takerName}</p>}
            {d.cannotTakeWhy && !d.row.take && <p className="text-muted">{d.cannotTakeWhy}</p>}
            {msg && <p role="status">{msg}</p>}
            {d.canTake && <div><Button variant="solid" tone="accent" onClick={() => void take()}>맡기</Button></div>}
            {d.canCancel && <div><Button variant="outline" tone="danger" onClick={() => void cancel()}>맡기 취소</Button></div>}
        </div>
    );
}

/** 목록에서 고른 줄을 보인다 — 고른 게 없으면 안내만(고정 줄 없음). */
export function DetailPanel() {
    const sel = useSelection();
    if (!sel) return <EmptyState icon="ban" title="고른 보결이 없습니다" description="보결 목록에서 줄을 누르면 여기에 상세가 열립니다." />;
    return <DetailView key={`${sel.date}/${sel.rowId}`} date={sel.date} rowId={sel.rowId} />;
}
