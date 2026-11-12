import { useEffect, useState } from 'react';
import { Badge, EmptyState } from '../../pane-ui-system';
import { applyVisibility, getSlotSource, getViewer, groupByDateAndTime, mineOf, type VisibleRow } from './list';

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

function useRows(): VisibleRow[] | null {
    const [rows, setRows] = useState<VisibleRow[] | null>(null);
    useEffect(() => {
        let live = true;
        void getSlotSource().loadSlots(today()).then((r) => { if (live) setRows(applyVisibility(r, getViewer())); });
        return () => { live = false; };
    }, []);
    return rows;
}

export function RowLine({ r }: { r: VisibleRow }) {
    return (
        <li className="text-small flex items-baseline gap-2">
            <span>{r.trackName}</span>
            <Badge tone={r.status === '확정' ? 'neutral' : 'danger'}>{r.status}</Badge>
            <span>{r.body.absentName}</span>
            <span className="text-muted">{r.body.reason}</span>
            {r.take && <span>→ {r.take.takerName}</span>}
        </li>
    );
}

export function ListView({ rows }: { rows: VisibleRow[] }) {
    if (rows.length === 0) return <EmptyState icon="ban" title="오늘 보결이 없습니다" description="올라온 보결 줄이 없습니다." />;
    return (
        <div className="flex flex-col gap-3">
            {groupByDateAndTime(rows).map((d) => (
                <section key={d.date} className="flex flex-col gap-1">
                    <h3 className="text-small text-muted">{d.date}</h3>
                    {d.times.map((t) => (
                        <div key={t.startMin}>
                            <p className="text-small">{hhmm(t.startMin)}~{hhmm(t.endMin)}</p>
                            <ul className="flex flex-col gap-1 pl-3">{t.rows.map((r) => <RowLine key={r.id} r={r} />)}</ul>
                        </div>
                    ))}
                </section>
            ))}
        </div>
    );
}

export function MineView({ rows, personRef }: { rows: VisibleRow[]; personRef: string | null }) {
    const m = mineOf(rows, personRef);
    if (m.taking.length === 0 && m.absent.length === 0) return <EmptyState icon="ban" title="내 보결이 없습니다" description="맡은 줄도, 내가 빠진 줄도 없습니다." />;
    const block = (title: string, list: VisibleRow[]) => list.length > 0 && (
        <section className="flex flex-col gap-1">
            <h3 className="text-small text-muted">{title}</h3>
            <ul className="flex flex-col gap-1">{list.map((r) => <li key={r.id} className="text-small">{r.date} {hhmm(r.startMin)} · <RowLine r={r} /></li>)}</ul>
        </section>
    );
    return <div className="flex flex-col gap-3">{block('내가 맡은 보결', m.taking)}{block('내가 빠진 보결', m.absent)}</div>;
}

export function ListPanel() {
    const rows = useRows();
    return <div className="p-4 max-w-3xl">{rows === null ? <p className="text-small text-muted">불러오는 중…</p> : <ListView rows={rows} />}</div>;
}
export function MinePanel() {
    const rows = useRows();
    return <div className="p-4 max-w-3xl">{rows === null ? <p className="text-small text-muted">불러오는 중…</p> : <MineView rows={rows} personRef={getViewer().personRef} />}</div>;
}
