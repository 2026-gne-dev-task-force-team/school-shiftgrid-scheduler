/** 편집 — 반별/교사별/특별실별 뷰. 반별은 두 번 클릭 이동(미리보기 결과표·하드면 실행 잠김) */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/store';
import { candidateCells, previewMove, type CellVerdict, type MovePreview } from '../../engine/api';
import type { Assignment, Agent, Activity, Resource, Track } from '../../types/schema';
import {
    indexBy, indexAssignments, cellKey, dayName, activeDays, allLessonStarts, slotStartOf,
} from '../lib';
import { Button, Select, Mark, Info, Modal, Pill } from '../parts/ui';
import { Icon } from '../parts/Icon';

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

    // 진단에서 건너온 초점
    useEffect(() => {
        const f = st.focus;
        if (f.view) setView(f.view);
        const id = f.trackId ?? f.agentId ?? f.resourceId;
        if (id) setSelId(id);
        // 초점은 한 번 쓰고 비운다
        if (f.view || id) st.setFocus({});
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

    const verdicts = useMemo(() => {
        if (!held) return null;
        return candidateCells(doc, held).cells;
    }, [held, doc]);

    const list = view === 'track' ? doc.tracks : view === 'agent' ? doc.agents : doc.resources;
    const curId = selId || list[0]?.id || '';

    const clickTrackCell = (trackId: string, day: number, slotIndex: number) => {
        const a = asgIx.get(cellKey(trackId, day, slotIndex));
        if (!held) { if (a && !a.fixed) setHeld(a.id); return; }
        if (a && a.id === held) { setHeld(null); return; }
        const move = { assignmentId: held, to: { trackId, dayIndex: day, slotIndex }, swap: !!a };
        const p = st.runEngine('이동 미리보기', () => previewMove(doc, move));
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
                        <button key={v} onClick={() => { setView(v); setSelId(''); setHeld(null); }}
                            className={`px-3 py-1.5 text-[12px] ${view === v ? 'bg-accent text-white' : 'bg-panel2 text-muted hover:text-text'}`}>
                            {v === 'track' ? '반별' : v === 'agent' ? '교사별' : '특별실별'}
                        </button>
                    ))}
                </div>
                <Select value={curId} onChange={(v) => { setSelId(v); setHeld(null); }}>
                    {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                {view === 'track' && (
                    <Info lines={[
                        '칸을 한 번 누르면 배치를 집습니다. 갈 수 있는 칸이 색으로 표시됩니다(초록 되고 · 노랑 소프트 · 빨강 하드).',
                        '두 번째 칸을 누르면 옮기기 전 규칙별 전·후 결과표가 뜹니다. 하드가 깨지면 실행이 잠깁니다.',
                        'Esc 로 놓습니다. 칸의 작은 도구로 이동금지·삭제를 합니다.',
                    ]} />
                )}
                {held && <Pill tone="accent">집은 배치 하나 · Esc 로 놓기</Pill>}
                {view !== 'track' && <span className="text-[12px] text-muted">교사별·특별실별은 시각순으로 봅니다(옮기기는 반별에서).</span>}
            </div>

            {view === 'track'
                ? <TrackGrid trackId={curId} asgIx={asgIx} ix={ix} viol={viol} held={held} verdicts={verdicts} onCell={clickTrackCell} />
                : <TimeGrid view={view} ownerId={curId} ix={ix} viol={viol} />}

            {/* 폰: 잡힌 칸의 도구를 격자 아래 고정 줄로 (호버 툴바가 안 먹는다) */}
            {held && view === 'track' && (() => {
                const a = doc.assignments.find((x) => x.id === held);
                if (!a) return null;
                return (
                    <div className="md:hidden sticky bottom-0 z-10 flex items-center gap-2 bg-panel border border-line rounded-md p-2 shadow-lg">
                        <span className="text-[12px] text-muted flex-1 truncate">집은 배치 — {ix.activities.get(a.activityId ?? '')?.name ?? a.label ?? '(빈 배치)'}</span>
                        <Button variant={a.pinned ? 'primary' : 'ghost'} icon="pin" onClick={() => st.act.togglePin(a.id)}>이동금지</Button>
                        <Button variant="danger" icon="trash" onClick={() => { st.act.clearCell({ trackId: a.trackId, dayIndex: a.dayIndex, slotIndex: a.slotIndex }); setHeld(null); }}>삭제</Button>
                        <Button variant="soft" icon="x" onClick={() => setHeld(null)}>놓기</Button>
                    </div>
                );
            })()}

            {preview && <MovePreviewModal preview={preview} onClose={() => setPreview(null)} onRun={doMove} />}
        </div>
    );
}

// ── 반별 격자 (두 번 클릭 이동) ───────────────────────────────
type Ix = { agents: Map<string, Agent>; activities: Map<string, Activity>; resources: Map<string, Resource>; tracks: Map<string, Track> };
type Viol = Map<string, { hard: boolean; msgs: string[] }>;

function TrackGrid({ trackId, asgIx, ix, viol, held, verdicts, onCell }: {
    trackId: string; asgIx: Map<string, Assignment>; ix: Ix; viol: Viol;
    held: string | null; verdicts: Record<string, CellVerdict> | null;
    onCell: (trackId: string, day: number, slotIndex: number) => void;
}) {
    const st = useStore();
    const track = st.doc.tracks.find((t) => t.id === trackId);
    const spec = st.doc.specs.find((s) => s.id === track?.specId);
    if (!track || !spec) return <p className="text-[13px] text-muted">반과 규격을 고르세요.</p>;

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
                                const a = asgIx.get(cellKey(trackId, d, sl.index));
                                const vk = held ? verdicts?.[`${d}:${sl.index}`] : undefined;
                                const isHeld = a && a.id === held;
                                const vcls = isHeld ? VERDICT.self : vk ? VERDICT[vk] : 'border-line bg-panel2 hover:bg-line';
                                const bad = a ? viol.get(a.id) : undefined;
                                return (
                                    <td key={d} className="p-0.5 align-top">
                                        <div onClick={() => onCell(trackId, d, sl.index)}
                                            className={`group relative h-14 rounded border px-1.5 py-1 cursor-pointer grid-cell ${vcls}`}>
                                            {a ? <CellBody a={a} ix={ix} bad={bad} /> : <span className="text-[10px] text-muted/40">빈 칸</span>}
                                            {a && (
                                                <div className="absolute right-0.5 bottom-0.5 hidden group-hover:flex items-center gap-0.5 bg-panel/90 rounded px-0.5" onClick={(e) => e.stopPropagation()}>
                                                    <button title="이동금지" className={`p-0.5 ${a.pinned ? 'text-accenth' : 'text-muted hover:text-text'}`} onClick={() => st.act.togglePin(a.id)}><Icon name="pin" size={12} /></button>
                                                    <button title="삭제" className="p-0.5 text-muted hover:text-bad" onClick={() => st.act.clearCell({ trackId, dayIndex: d, slotIndex: sl.index })}><Icon name="trash" size={12} /></button>
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

// ── 교사별·특별실별 (시각 행, 읽기+도구) ──────────────────────
function TimeGrid({ view, ownerId, ix, viol }: { view: 'agent' | 'resource'; ownerId: string; ix: Ix; viol: Viol }) {
    const st = useStore();
    const doc = st.doc;
    const starts = allLessonStarts(doc);
    const days = [0, 1, 2, 3, 4];
    const mine = doc.assignments.filter((a) => view === 'agent' ? a.agentId === ownerId : a.resourceId === ownerId);
    const at = (day: number, start: string) => mine.find((a) => a.dayIndex === day && slotStartOf(doc, a) === start);
    if (!ownerId) return <p className="text-[13px] text-muted">대상을 고르세요.</p>;
    if (starts.length === 0) return <p className="text-[13px] text-muted">규격이 있어야 시각 행을 만듭니다.</p>;

    return (
        <div className="overflow-auto">
            <table className="border-collapse text-[12px]">
                <thead><tr><th className="w-16" />{days.map((d) => <th key={d} className="min-w-[120px] py-1 font-medium text-muted">{dayName(doc.specs[0], d)}</th>)}</tr></thead>
                <tbody>
                    {starts.map((start) => (
                        <tr key={start}>
                            <td className="text-right pr-2 text-[11px] text-muted">{start}</td>
                            {days.map((d) => {
                                const a = at(d, start);
                                const bad = a ? viol.get(a.id) : undefined;
                                return (
                                    <td key={d} className="p-0.5 align-top">
                                        <div className="group relative h-14 rounded border border-line bg-panel2 px-1.5 py-1 grid-cell">
                                            {a ? <CellBody a={a} ix={ix} bad={bad} owner={view} /> : <span className="text-[10px] text-muted/40" />}
                                            {a && (
                                                <div className="absolute right-0.5 bottom-0.5 hidden group-hover:flex items-center gap-0.5 bg-panel/90 rounded px-0.5">
                                                    <button title="이동금지" className={`p-0.5 ${a.pinned ? 'text-accenth' : 'text-muted hover:text-text'}`} onClick={() => st.act.togglePin(a.id)}><Icon name="pin" size={12} /></button>
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
    const agent = a.agentId ? ix.agents.get(a.agentId)?.name : undefined;
    const res = a.resourceId ? ix.resources.get(a.resourceId)?.name : undefined;
    const track = ix.tracks.get(a.trackId)?.name;
    const bottom = owner === 'agent' ? [track, res].filter(Boolean).join(' · ')
        : owner === 'resource' ? [track, agent].filter(Boolean).join(' · ')
            : [agent, res].filter(Boolean).join(' · ');
    return (
        <div className="leading-tight" title={bad?.msgs.join('\n')}>
            <div className="truncate text-text flex items-center gap-1">
                {bad && <Mark kind={bad.hard ? 'bad' : 'warn'} className="text-[10px]" />}
                {a.pinned && <span title="이동금지">📌</span>}{a.fixed && <span title="고정">🔒</span>}
                {act ?? '(빈 배치)'}
            </div>
            {bottom && <div className="truncate text-muted text-[10px]">{bottom}</div>}
        </div>
    );
}

// ── 이동 미리보기 모달 (결과표 · 하드면 실행 잠김) ────────────
function MovePreviewModal({ preview, onClose, onRun }: { preview: MovePreview; onClose: () => void; onRun: () => void }) {
    return (
        <Modal title="이동 미리보기" onClose={onClose} wide noMobileFooter>
            <div className="space-y-3 text-[13px]">
                <div className="flex items-center gap-2">
                    {preview.hardBroken
                        ? <><Mark kind="bad" /> <span>하드 규칙이 깨져 이동할 수 없습니다.</span></>
                        : <><Mark kind="ok" /> <span>하드는 괜찮습니다. 소프트 변화만 확인하세요.</span></>}
                    <span className="ml-auto text-muted text-[12px]">소프트 벌점 {preview.softBefore} → {preview.softAfter} ({fmtDelta(preview.softAfter - preview.softBefore)})</span>
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
                                    <td className="border-b border-line/50 px-2 py-1">{r.kind === 'hard' ? <Pill tone="bad">하드</Pill> : <Pill tone="warn">소프트</Pill>}</td>
                                    <td className="border-b border-line/50 px-2 py-1">{r.before}</td>
                                    <td className="border-b border-line/50 px-2 py-1">{r.after}</td>
                                    <td className={`border-b border-line/50 px-2 py-1 ${r.delta > 0 ? 'text-bad' : r.delta < 0 ? 'text-ok' : 'text-muted'}`}>{fmtDelta(r.delta)}</td>
                                </tr>
                            ))}
                            {preview.rows.length === 0 && <tr><td colSpan={5} className="px-2 py-2 text-muted">변하는 규칙이 없습니다.</td></tr>}
                        </tbody>
                    </table>
                </div>
                {preview.hardBroken && <p className="text-[11px] text-muted text-right md:text-right">하드가 깨지는 이동은 실행할 수 없습니다.</p>}
                <div className="hidden md:flex justify-end gap-2">
                    <Button variant="soft" onClick={onClose}>그만</Button>
                    <Button variant="primary" icon="check" onClick={onRun} disabled={preview.hardBroken}
                        title={preview.hardBroken ? '하드가 깨져 잠겨 있습니다' : ''}>이동 실행</Button>
                </div>
                {/* 폰: 실행/취소를 아래 고정 줄로 */}
                <div className="md:hidden sticky bottom-0 -mx-4 px-4 py-3 bg-panel border-t border-line flex gap-2"
                    style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                    <Button variant="soft" className="flex-1 justify-center" onClick={onClose}>그만</Button>
                    <Button variant="primary" icon="check" className="flex-1 justify-center" onClick={onRun} disabled={preview.hardBroken}
                        title={preview.hardBroken ? '하드가 깨져 잠겨 있습니다' : ''}>이동 실행</Button>
                </div>
            </div>
        </Modal>
    );
}

function fmtDelta(n: number): string { return n > 0 ? `+${n}` : String(n); }
