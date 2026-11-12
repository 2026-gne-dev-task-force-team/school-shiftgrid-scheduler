import { useEffect, useState } from 'react';
import { Badge, EmptyState, isImeEnter } from '../../pane-ui-system';
import { setSelection } from './detail';
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

export function RowLine({ r, onOpen }: { r: VisibleRow; onOpen?: (r: VisibleRow) => void }) {
    const open = onOpen ? { role: 'button', tabIndex: 0, onClick: () => onOpen(r), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !isImeEnter(e)) onOpen(r); } } : {};
    return (
        <li className={`text-small flex items-baseline gap-2${onOpen ? ' cursor-pointer' : ''}`} {...open}>
            <span>{r.trackName}</span>
            <Badge tone={r.status === '확정' ? 'neutral' : 'danger'}>{r.status}</Badge>
            <span>{r.body.absentName}</span>
            <span className="text-muted">{r.body.reason}</span>
            {r.take && <span>→ {r.take.takerName}</span>}
        </li>
    );
}

export function ListView({ rows, onOpen }: { rows: VisibleRow[]; onOpen?: (r: VisibleRow) => void }) {
    if (rows.length === 0) return <EmptyState icon="ban" title="오늘 보결이 없습니다" description="올라온 보결 줄이 없습니다." />;
    return (
        <div className="flex flex-col gap-3">
            {groupByDateAndTime(rows).map((d) => (
                <section key={d.date} className="flex flex-col gap-1">
                    <h3 className="text-small text-muted">{d.date}</h3>
                    {d.times.map((t) => (
                        <div key={t.startMin}>
                            <p className="text-small">{hhmm(t.startMin)}~{hhmm(t.endMin)}</p>
                            <ul className="flex flex-col gap-1 pl-3">{t.rows.map((r) => <RowLine key={r.id} r={r} onOpen={onOpen} />)}</ul>
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

/** 줄을 누르면 그 줄을 고른 것으로 적고(onOpen) 상세 화면을 연다 — 여는 손은 플러그인(host)이 준다. */
export function ListPanel({ onOpen }: { onOpen?: () => void }) {
    const rows = useRows();
    const pick = (r: VisibleRow) => { setSelection({ date: r.date, rowId: r.id }); onOpen?.(); };
    return <div className="p-4 max-w-3xl">{rows === null ? <p className="text-small text-muted">불러오는 중…</p> : <ListView rows={rows} onOpen={pick} />}</div>;
}
export function MinePanel() {
    const rows = useRows();
    return <div className="p-4 max-w-3xl">{rows === null ? <p className="text-small text-muted">불러오는 중…</p> : <MineView rows={rows} personRef={getViewer().personRef} />}</div>;
}
