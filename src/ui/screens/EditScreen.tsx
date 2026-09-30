/** 직접 조정 — 반별/교사별/특별실별 뷰. 반별·교사별·특별실별 모두 두 번 클릭으로 옮긴다(미리보기 결과표) */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/store';
import { candidateCells, previewMove, type CellVerdict, type CellVerdicts, type MovePreview } from '../../engine/api';
import type { Assignment, Agent, Activity, Resource, Track } from '../../types/schema';
import {
    indexBy, indexAssignments, cellAt, dayName, activeDays, allLessonStarts, slotStartOf,
    lessonCountForDay, lessonOrdinal, agentLabelOf, specOfTrack,
} from '../lib';
import { Button, Select, Mark, Info, Modal, Pill } from '../parts/ui';
import { Icon } from '../parts/Icon';
import { L } from '../help/terms';
import { RICH } from '../help/richContent';

type View = 'track' | 'agent' | 'resource';

const VERDICT: Record<CellVerdict, string> = {
    ok: 'border-ok/60 bg-ok/10',
    soft: 'border-warn/60 bg-warn/10',
    hard: 'border-bad/60 bg-bad/10',
    occupied: 'border-line bg-panel2 text-muted',
    blocked: 'border-line bg-panel2/50 text-muted/60',
    self: 'border-accent ring-1 ring-accent bg-accent/10',
};

export default function EditScreen() {
    const st = useStore();
    const { doc } = st;
    const [view, setView] = useState<View>('track');
    const [selId, setSelId] = useState('');
    const [held, setHeld] = useState<string | null>(null);
    const [preview, setPreview] = useState<MovePreview | null>(null);
    const [highlight, setHighlight] = useState<Set<string>>(new Set());

    // 점검에서 건너온 초점
    useEffect(() => {
        const f = st.focus;
        if (f.view) setView(f.view);
        const id = f.trackId ?? f.agentId ?? f.resourceId;
        if (id) setSelId(id);
        if (f.assignmentIds?.length) setHighlight(new Set(f.assignmentIds));
        if (f.view || id || f.assignmentIds) st.setFocus({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Esc = 놓기 (홀드 중일 때만 가로챈다 → Shell 의 홈 이동을 막는다)
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && held) { e.preventDefault(); e.stopImmediatePropagation(); setHeld(null); }
        };
        window.addEventListener('keydown', h, true);
        return () => window.removeEventListener('keydown', h, true);
    }, [held]);

    const ix = { agents: indexBy(doc.agents), activities: indexBy(doc.activities), resources: indexBy(doc.resources), tracks: indexBy(doc.tracks) };
    const asgIx = useMemo(() => indexAssignments(doc.assignments), [doc.assignments]);

    // 위반 색인 (칸 표식·호버 문장)
    const viol = useMemo(() => {
        const m = new Map<string, { hard: boolean; msgs: string[] }>();
        for (const r of st.diag.rules) for (const v of r.violations) for (const id of v.assignmentIds) {
            const cur = m.get(id) ?? { hard: false, msgs: [] };
            cur.hard = cur.hard || v.kind === 'hard';
            cur.msgs.push(v.message);
            m.set(id, cur);
        }
        return m;
    }, [st.diag]);

    const cv = useMemo<CellVerdicts | null>(() => {
        if (!held) return null;
        return candidateCells(doc, held);
    }, [held, doc]);

    const heldAssign = held ? doc.assignments.find((a) => a.id === held) : undefined;
    const heldTrackId = heldAssign?.trackId;

    const list = view === 'track' ? doc.tracks : view === 'agent' ? doc.agents.filter((a) => a.id !== '__homeroom__') : doc.resources;
    const curId = selId || list[0]?.id || '';

    // 갈 곳 없음 배너 — 초록·노랑 칸이 하나도 없으면 가장 많이 걸린 규칙을 알린다 (선생님 의견 #19)
    const noWhere = useMemo(() => {
        if (!cv) return null;
        const vals = Object.values(cv.cells);
        if (vals.some((v) => v === 'ok' || v === 'soft')) return null;
        const count = new Map<string, number>();
        for (const rs of Object.values(cv.reasons)) for (const r of rs) count.set(r, (count.get(r) ?? 0) + 1);
        let top = ''; let max = 0;
        for (const [r, n] of count) if (n > max) { max = n; top = r; }
        return top;
    }, [cv]);

    const clickTrackCell = (trackId: string, day: number, slotIndex: number) => {
        const here = cellAt(asgIx, trackId, day, slotIndex);
        const first = here.find((a) => !a.fixed) ?? here[0];
        if (!held) { if (first && !first.fixed) setHeld(first.id); return; }
        if (first && first.id === held) { setHeld(null); return; }
        const move = { assignmentId: held, to: { trackId, dayIndex: day, slotIndex }, swap: here.length > 0 };
        const p = st.runEngine(L.movePreview, () => previewMove(doc, move));
        if (p) setPreview(p); else setHeld(null);
    };

    // #18 — 교사별·특별실별에서 시각 칸을 눌러 옮긴다. 선택한 수업의 반은 고정, 목적지 교시 = 그 시각과 같은 start
    const clickTimeCell = (day: number, start: string, ownAssign: Assignment | undefined) => {
        if (!held) { if (ownAssign && !ownAssign.fixed) setHeld(ownAssign.id); return; }
        if (ownAssign && ownAssign.id === held) { setHeld(null); return; }
        if (!heldAssign) { setHeld(null); return; }
        const spec = specOfTrack(doc, ix.tracks.get(heldAssign.trackId));
        const slot = spec?.slots.find((s) => s.assignable && s.start === start);
        // 그 반에 이 시각의 교시가 없으면 옮길 수 없다(칸이 빨강 + 툴팁으로 이미 안내된다)
        if (!spec || !slot) return;
        const target = cellAt(asgIx, heldAssign.trackId, day, slot.index);
        const move = { assignmentId: held, to: { trackId: heldAssign.trackId, dayIndex: day, slotIndex: slot.index }, swap: target.length > 0 };
        const p = st.runEngine(L.movePreview, () => previewMove(doc, move));
        if (p) setPreview(p); else setHeld(null);
    };

    const doMove = () => {
        if (preview) { st.act.applyMove(preview.move); setPreview(null); setHeld(null); }
    };

    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-md overflow-hidden border border-line">
                    {(['track', 'agent', 'resource'] as View[]).map((v) => (
                        <button key={v} onClick={() => { setView(v); setSelId(''); }}
                            className={`px-3 py-1.5 text-[12px] ${view === v ? 'bg-accent text-white' : 'bg-panel2 text-muted hover:text-text'}`}>
                            {v === 'track' ? '반별' : v === 'agent' ? '교사별' : '특별실별'}
                        </button>
                    ))}
                </div>
                <Select value={curId} onChange={(v) => setSelId(v)}>
                    {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                <Info help={RICH.edit} />
                {held && <Pill tone="accent">수업 하나 선택됨 · Esc 로 해제</Pill>}
            </div>

            {held && <MoveLegend />}
            {noWhere !== null && (
                <div className="rounded-md border border-bad/40 bg-bad/10 p-2.5 text-[12.5px] text-bad">
                    {noWhere
                        ? <>이 수업은 「{noWhere}」 때문에 옮길 곳이 없습니다. 먼저 관련 수업을 옮기거나 규칙 설정을 확인하세요.</>
                        : <>이 수업을 옮길 수 있는 칸이 없습니다. 먼저 관련 수업을 옮기거나 규칙 설정을 확인하세요.</>}
                </div>
            )}

            <div data-tour="edit-grid">
                {view === 'track'
                    ? <TrackGrid trackId={curId} asgIx={asgIx} ix={ix} viol={viol} held={held} heldTrackId={heldTrackId} cv={cv} highlight={highlight} onCell={clickTrackCell} />
                    : <TimeGrid view={view} ownerId={curId} ix={ix} viol={viol} held={held} heldAssign={heldAssign} cv={cv} highlight={highlight} onCell={clickTimeCell} />}
            </div>

            {/* 폰: 잡힌 칸의 도구를 격자 아래 고정 줄로 */}
            {held && (() => {
                const a = doc.assignments.find((x) => x.id === held);
                if (!a) return null;
                return (
                    <div className="md:hidden sticky bottom-0 z-10 flex items-center gap-2 bg-panel border border-line rounded-md p-2 shadow-lg">
                        <span className="text-[12px] text-muted flex-1 truncate">선택한 수업 — {ix.activities.get(a.activityId ?? '')?.name ?? a.label ?? '(빈 칸)'}</span>
                        <Button variant={a.pinned ? 'primary' : 'ghost'} icon="pin" onClick={() => st.act.togglePin(a.id)}>{L.pin}</Button>
                        <Button variant="danger" icon="trash" onClick={() => { st.act.clearCell({ trackId: a.trackId, dayIndex: a.dayIndex, slotIndex: a.slotIndex }); setHeld(null); }}>{L.delete}</Button>
                        <Button variant="soft" icon="x" onClick={() => setHeld(null)}>{L.deselect}</Button>
                    </div>
                );
            })()}

            {preview && <MovePreviewModal preview={preview} onClose={() => setPreview(null)} onRun={doMove} />}
        </div>
    );
}

function MoveLegend() {
    return (
        <div className="flex items-center gap-3 text-[11px] text-muted flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-ok/40 inline-block" /> 옮길 수 있음</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warn/40 inline-block" /> 권장 점수 증가</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-bad/40 inline-block" /> 필수 규칙 위반</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-panel2 border border-line inline-block" /> 배정 불가·고정·잠금</span>
        </div>
    );
}

// ── 반별 격자 (두 번 클릭 이동) ───────────────────────────────
type Ix = { agents: Map<string, Agent>; activities: Map<string, Activity>; resources: Map<string, Resource>; tracks: Map<string, Track> };
type Viol = Map<string, { hard: boolean; msgs: string[] }>;

function TrackGrid({ trackId, asgIx, ix, viol, held, heldTrackId, cv, highlight, onCell }: {
    trackId: string; asgIx: Map<string, Assignment[]>; ix: Ix; viol: Viol;
    held: string | null; heldTrackId: string | undefined; cv: CellVerdicts | null; highlight: Set<string>;
    onCell: (trackId: string, day: number, slotIndex: number) => void;
}) {
    const st = useStore();
    const track = st.doc.tracks.find((t) => t.id === trackId);
    const spec = st.doc.specs.find((s) => s.id === track?.specId);
    if (!track || !spec) return <p className="text-[13px] text-muted">반과 시간 틀을 고르세요.</p>;
    const showVerdict = held && heldTrackId === trackId;

    return (
        <div className="overflow-auto">
            <table className="border-collapse text-[12px] select-none">
                <thead><tr><th className="w-14" />{activeDays(spec).map((d) => <th key={d} className="min-w-[120px] py-1 font-medium text-muted">{dayName(spec, d)}</th>)}</tr></thead>
                <tbody>
                    {spec.slots.map((sl) => (
                        <tr key={sl.index}>
                            <td className="text-right pr-2 text-[11px] text-muted align-top">{sl.label}<div className="text-[10px] text-muted/60">{sl.start}</div></td>
                            {activeDays(spec).map((d) => {
                                if (!sl.assignable) return <td key={d} className="p-0.5"><div className="h-14 rounded bg-panel2/40 grid place-items-center text-[10px] text-muted/60">{sl.kind === 'lunch' ? '점심' : ''}</div></td>;
                                // #15 — 그 요일에 없는 교시는 회색·클릭 불가
                                if (lessonOrdinal(spec, sl.index) >= lessonCountForDay(spec, d)) return <td key={d} className="p-0.5"><div className="h-14 rounded bg-panel2/30 grid place-items-center text-[10px] text-muted/40">—</div></td>;
                                const here = cellAt(asgIx, trackId, d, sl.index);
                                const key = `${d}:${sl.index}`;
                                const vk = showVerdict ? cv?.cells[key] : undefined;
                                const reasons = showVerdict ? cv?.reasons[key] : undefined;
                                const isHeld = here.some((a) => a.id === held);
                                const vcls = isHeld ? VERDICT.self : vk ? VERDICT[vk] : 'border-line bg-panel2 hover:bg-line';
                                const stacked = here.length > 1;
                                const hl = here.some((a) => highlight.has(a.id));
                                return (
                                    <td key={d} className="p-0.5 align-top">
                                        <div onClick={() => onCell(trackId, d, sl.index)}
                                            title={reasons?.length ? reasons.join(' · ') : undefined}
                                            className={`group relative h-14 rounded border px-1.5 py-1 cursor-pointer grid-cell ${vcls} ${stacked ? 'border-bad' : ''} ${hl ? 'ring-2 ring-accent' : ''}`}>
                                            {here.length > 0
                                                ? <div className="space-y-0.5">{here.map((a) => <CellBody key={a.id} a={a} ix={ix} bad={viol.get(a.id)} />)}</div>
                                                : <span className="text-[10px] text-muted/40">빈 칸</span>}
                                            {here[0] && (
                                                <div className="absolute right-0.5 bottom-0.5 hidden group-hover:flex items-center gap-0.5 bg-panel/90 rounded px-0.5" onClick={(e) => e.stopPropagation()}>
                                                    <button title={L.pin} className={`p-0.5 ${here[0].pinned ? 'text-accenth' : 'text-muted hover:text-text'}`} onClick={() => st.act.togglePin(here[0].id)}><Icon name="pin" size={12} /></button>
                                                    <button title={L.delete} className="p-0.5 text-muted hover:text-bad" onClick={() => st.act.clearCell({ trackId, dayIndex: d, slotIndex: sl.index })}><Icon name="trash" size={12} /></button>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── 교사별·특별실별 (시각 행, #18 옮기기 지원) ─────────────────
function TimeGrid({ view, ownerId, ix, viol, held, heldAssign, cv, highlight, onCell }: {
    view: 'agent' | 'resource'; ownerId: string; ix: Ix; viol: Viol;
    held: string | null; heldAssign: Assignment | undefined; cv: CellVerdicts | null; highlight: Set<string>;
    onCell: (day: number, start: string, ownAssign: Assignment | undefined) => void;
}) {
    const st = useStore();
    const doc = st.doc;
    const starts = allLessonStarts(doc);
    const days = [0, 1, 2, 3, 4];
    const belongs = (a: Assignment) => view === 'agent' ? (a.agentId === ownerId || a.coAgentId === ownerId) : a.resourceId === ownerId;
    const mine = doc.assignments.filter(belongs);
    const at = (day: number, start: string) => mine.find((a) => a.dayIndex === day && slotStartOf(doc, a) === start);
    if (!ownerId) return <p className="text-[13px] text-muted">대상을 고르세요.</p>;
    if (starts.length === 0) return <p className="text-[13px] text-muted">시간 틀이 있어야 시각 행을 만듭니다.</p>;

    // 선택 중이면, 이 시각에 선택한 수업의 반 교시가 있는지로 칸 색을 정한다 (#18·#19)
    const heldSpec = heldAssign ? specOfTrack(doc, ix.tracks.get(heldAssign.trackId)) : undefined;
    const verdictAt = (day: number, start: string): { cls: string; title?: string } => {
        if (!held || !heldAssign || !heldSpec) return { cls: 'border-line bg-panel2 hover:bg-line' };
        const slot = heldSpec.slots.find((s) => s.assignable && s.start === start);
        if (!slot) return { cls: 'border-bad/50 bg-bad/5 text-muted/60', title: '이 반의 교시와 맞지 않는 시각입니다' };
        const key = `${day}:${slot.index}`;
        const vk = cv?.cells[key];
        const reasons = cv?.reasons[key];
        return { cls: vk ? VERDICT[vk] : 'border-line bg-panel2 hover:bg-line', title: reasons?.length ? reasons.join(' · ') : undefined };
    };

    return (
        <div className="overflow-auto">
            <table className="border-collapse text-[12px] select-none">
                <thead><tr><th className="w-16" />{days.map((d) => <th key={d} className="min-w-[120px] py-1 font-medium text-muted">{dayName(doc.specs[0], d)}</th>)}</tr></thead>
                <tbody>
                    {starts.map((start) => (
                        <tr key={start}>
                            <td className="text-right pr-2 text-[11px] text-muted">{start}</td>
                            {days.map((d) => {
                                const a = at(d, start);
                                const isHeld = a && a.id === held;
                                const v = verdictAt(d, start);
                                const hl = a && highlight.has(a.id);
                                return (
                                    <td key={d} className="p-0.5 align-top">
                                        <div onClick={() => onCell(d, start, a)}
                                            title={v.title}
                                            className={`group relative h-14 rounded border px-1.5 py-1 cursor-pointer grid-cell ${isHeld ? VERDICT.self : v.cls} ${hl ? 'ring-2 ring-accent' : ''}`}>
                                            {a ? <CellBody a={a} ix={ix} bad={viol.get(a.id)} owner={view} /> : <span className="text-[10px] text-muted/40" />}
                                            {a && (
                                                <div className="absolute right-0.5 bottom-0.5 hidden group-hover:flex items-center gap-0.5 bg-panel/90 rounded px-0.5" onClick={(e) => e.stopPropagation()}>
                                                    <button title={L.pin} className={`p-0.5 ${a.pinned ? 'text-accenth' : 'text-muted hover:text-text'}`} onClick={() => st.act.togglePin(a.id)}><Icon name="pin" size={12} /></button>
                                                    <button title={L.delete} className="p-0.5 text-muted hover:text-bad" onClick={() => st.act.clearCell({ trackId: a.trackId, dayIndex: a.dayIndex, slotIndex: a.slotIndex })}><Icon name="trash" size={12} /></button>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function CellBody({ a, ix, bad, owner }: { a: Assignment; ix: Ix; bad?: { hard: boolean; msgs: string[] }; owner?: 'agent' | 'resource' }) {
    const act = a.activityId ? ix.activities.get(a.activityId)?.name : a.label;
    const agent = agentLabelOf(a, ix);
    const res = a.resourceId ? ix.resources.get(a.resourceId)?.name : undefined;
    const track = ix.tracks.get(a.trackId)?.name;
    const bottom = owner === 'agent' ? [track, res].filter(Boolean).join(' · ')
        : owner === 'resource' ? [track, agent].filter(Boolean).join(' · ')
            : [agent, res].filter(Boolean).join(' · ');
    return (
        <div className="leading-tight" title={bad?.msgs.join('\n')}>
            <div className="truncate text-text flex items-center gap-1">
                {bad && <Mark kind={bad.hard ? 'bad' : 'warn'} className="text-[10px]" />}
                {a.pinned && <span title={L.pinned}>📌</span>}{a.fixed && <span title={L.fixedLesson}>🔒</span>}
                {act ?? '(빈 칸)'}
            </div>
            {bottom && <div className="truncate text-muted text-[10px]">{bottom}</div>}
        </div>
    );
}

// ── 이동 미리보기 모달 (결과표 · 필수 깨지면 실행 잠김) ────────
function MovePreviewModal({ preview, onClose, onRun }: { preview: MovePreview; onClose: () => void; onRun: () => void }) {
    return (
        <Modal title={L.movePreview} onClose={onClose} wide noMobileFooter>
            <div className="space-y-3 text-[13px]">
                <div className="flex items-center gap-2">
                    {preview.hardBroken
                        ? <><Mark kind="bad" /> <span>필수 규칙이 깨져 이동할 수 없습니다.</span></>
                        : <><Mark kind="ok" /> <span>필수 규칙은 괜찮습니다. 권장 점수 변화만 확인하세요.</span></>}
                    <span className="ml-auto text-muted text-[12px]">{L.softScore} {preview.softBefore} → {preview.softAfter} ({fmtDelta(preview.softAfter - preview.softBefore)})</span>
                </div>
                {preview.hardBroken && preview.hardReasons.length > 0 && (
                    <ul className="rounded-md border border-bad/40 bg-bad/10 p-2 text-[12px] text-bad space-y-0.5">
                        {preview.hardReasons.map((r, i) => <li key={i}>· {r}</li>)}
                    </ul>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-[12px] border-collapse min-w-[420px]">
                        <thead><tr className="text-muted text-left">{['규칙', '종류', '전', '후', '차이'].map((h) => <th key={h} className="border-b border-line px-2 py-1 font-medium">{h}</th>)}</tr></thead>
                        <tbody>
                            {preview.rows.map((r) => (
                                <tr key={r.ruleId}>
                                    <td className="border-b border-line/50 px-2 py-1">{r.label}</td>
                                    <td className="border-b border-line/50 px-2 py-1">{r.kind === 'hard' ? <Pill tone="bad">{L.hardShort}</Pill> : <Pill tone="warn">{L.softShort}</Pill>}</td>
                                    <td className="border-b border-line/50 px-2 py-1">{r.before}</td>
                                    <td className="border-b border-line/50 px-2 py-1">{r.after}</td>
                                    <td className={`border-b border-line/50 px-2 py-1 ${r.delta > 0 ? 'text-bad' : r.delta < 0 ? 'text-ok' : 'text-muted'}`}>{fmtDelta(r.delta)}</td>
                                </tr>
                            ))}
                            {preview.rows.length === 0 && <tr><td colSpan={5} className="px-2 py-2 text-muted">변하는 규칙이 없습니다.</td></tr>}
                        </tbody>
                    </table>
                </div>
                {preview.hardBroken && <p className="text-[11px] text-muted text-right">필수 규칙이 깨지는 이동은 실행할 수 없습니다.</p>}
                <div className="hidden md:flex justify-end gap-2">
                    <Button variant="soft" onClick={onClose}>{L.cancel}</Button>
                    <Button variant="primary" icon="check" onClick={onRun} disabled={preview.hardBroken}
                        title={preview.hardBroken ? '필수 규칙이 깨져 잠겨 있습니다' : ''}>{L.doMove}</Button>
                </div>
                {/* 폰: 실행/취소를 아래 고정 줄로 */}
                <div className="md:hidden sticky bottom-0 -mx-4 px-4 py-3 bg-panel border-t border-line flex gap-2"
                    style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                    <Button variant="soft" className="flex-1 justify-center" onClick={onClose}>{L.cancel}</Button>
                    <Button variant="primary" icon="check" className="flex-1 justify-center" onClick={onRun} disabled={preview.hardBroken}
                        title={preview.hardBroken ? '필수 규칙이 깨져 잠겨 있습니다' : ''}>{L.doMove}</Button>
                </div>
            </div>
        </Modal>
    );
}

function fmtDelta(n: number): string { return n > 0 ? `+${n}` : String(n); }
