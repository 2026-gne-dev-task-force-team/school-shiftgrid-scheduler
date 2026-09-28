/** 고정·금지 — 대상의 격자에서 배정 불가·되도록 피함·임시 불가 순환, 고정 수업, 잠금(pin)
 *  · 반: 그 반 시간 틀의 교시 격자(요일별 없는 교시는 회색 · 선생님 의견 #15)
 *  · 교사·특별실: 모든 시간 틀의 수업 시각을 합친 「시각 축」 격자(금지칸을 시각으로 저장 · 선생님 의견 #12)
 */
import { useState } from 'react';
import { useStore } from '../../store/store';
import type { TargetRef, TimetableSpec } from '../../types/schema';
import { blockStateAt, type BlockState } from '../../store/doc-ops';
import { indexBy, indexAssignments, cellAt, dayName, activeDays, cellText, lessonCountForDay, lessonOrdinal, allLessonStarts } from '../lib';
import { Button, Select, Mark, Info, TextInput, Pill } from '../parts/ui';
import { L } from '../help/terms';

type Mode = 'block' | 'fixed' | 'pin';

const STATE_STYLE: Record<BlockState, string> = {
    none: 'bg-panel2 hover:bg-line border-line',
    ban: 'bg-bad/20 border-bad/50 text-bad',
    avoid: 'bg-warn/20 border-warn/50 text-warn',
    temp: 'bg-accent/20 border-accent/50 text-accenth',
};
const STATE_LABEL: Record<BlockState, string> = { none: '', ban: L.blockStates.ban, avoid: L.blockStates.avoid, temp: L.blockStates.temp };

/** 시각 축(교사·특별실 격자)의 한 행이 끝나는 시각 — 그 시각으로 시작하는 아무 수업 칸의 end */
function lessonEndOf(specs: TimetableSpec[], start: string): string {
    for (const sp of specs) for (const sl of sp.slots) if (sl.assignable && sl.start === start) return sl.end;
    return start;
}
/** 학년 목록을 "1·2학년" 꼴로 */
function gradesLabel(spec: TimetableSpec): string {
    const g = spec.grades;
    if (g && g.length) return `${g.join('·')}학년`;
    return spec.name;
}
/** 이 시각(start)에 점심인 시간 틀들의 라벨 — 「1·2학년 점심」 (선생님 의견 #12 · 시각으로 겹침) */
function lunchAt(specs: TimetableSpec[], start: string): string {
    const labels: string[] = [];
    for (const sp of specs) {
        const lunch = sp.slots.find((s) => s.kind === 'lunch');
        if (lunch && lunch.start <= start && start < lunch.end) labels.push(gradesLabel(sp));
    }
    return labels.length ? `${labels.join(' · ')} 점심` : '';
}

export default function BlocksScreen() {
    const st = useStore();
    const { doc } = st;
    const [kind, setKind] = useState<'track' | 'agent' | 'resource'>('track');
    const [id, setId] = useState('');
    const [mode, setMode] = useState<Mode>('block');
    const [fixActivity, setFixActivity] = useState('');
    const [fixLabel, setFixLabel] = useState('');

    const list = kind === 'track' ? doc.tracks : kind === 'agent' ? doc.agents : doc.resources;
    const targetId = id || list[0]?.id || '';
    const target: TargetRef | null = targetId ? { kind, id: targetId } : null;

    // 반 격자: 그 반 시간 틀. 교사·특별실 격자: 시각 축을 쓰므로 규격 하나가 아니다
    const trackSpec = kind === 'track'
        ? doc.specs.find((s) => s.id === doc.tracks.find((t) => t.id === targetId)?.specId)
        : undefined;

    const ix = { agents: indexBy(doc.agents), activities: indexBy(doc.activities), resources: indexBy(doc.resources), tracks: indexBy(doc.tracks) };
    const asgIx = indexAssignments(doc.assignments);
    const tempCount = doc.weeklyBlocks.filter((w) => w.temp).length;
    const days = trackSpec ? activeDays(trackSpec) : (doc.specs[0] ? activeDays(doc.specs[0]) : [0, 1, 2, 3, 4]);
    const starts = allLessonStarts(doc);

    const onTrackCell = (day: number, slotIndex: number) => {
        if (!target) return;
        if (mode === 'block') { st.act.cycleBlock(target, { dayIndex: day, slotIndex }); return; }
        const pos = { trackId: targetId, dayIndex: day, slotIndex };
        const cur = cellAt(asgIx, targetId, day, slotIndex)[0];
        if (mode === 'fixed') {
            if (cur) return; // 이미 있으면 안 덮는다
            st.act.addFixed(pos, fixActivity || undefined, fixLabel || (fixActivity ? ix.activities.get(fixActivity)?.name ?? L.fixedLesson : L.fixedLesson));
        } else if (mode === 'pin') {
            if (cur) st.act.togglePin(cur.id);
        }
    };
    const onTimeCell = (day: number, start: string) => {
        if (!target) return; // 교사·특별실은 금지칸(시각)만
        st.act.cycleBlock(target, { dayIndex: day, from: start, to: lessonEndOf(doc.specs, start) });
    };

    const noSpec = doc.specs.length === 0;

    return (
        <div className="p-4 space-y-3">
            <div data-tour="blocks-bar" className="flex items-center gap-2 flex-wrap">
                <Select value={kind} onChange={(v) => { setKind(v as never); setId(''); if (v !== 'track' && mode !== 'block') setMode('block'); }}>
                    <option value="track">{L.track}</option><option value="agent">{L.agent}</option><option value="resource">{L.resource}</option>
                </Select>
                <Select value={targetId} onChange={setId}>
                    {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                <div className="w-px h-6 bg-line mx-1" />
                <div className="flex rounded-md overflow-hidden border border-line">
                    {(['block', 'fixed', 'pin'] as Mode[]).map((m) => {
                        const label = m === 'block' ? '금지칸' : m === 'fixed' ? L.fixedLesson : L.pin;
                        const dis = m !== 'block' && kind !== 'track';
                        return (
                            <button key={m} disabled={dis} onClick={() => setMode(m)}
                                className={`px-2.5 py-1.5 text-[12px] disabled:opacity-30 ${mode === m ? 'bg-accent text-white' : 'bg-panel2 text-muted hover:text-text'}`}>{label}</button>
                        );
                    })}
                </div>
                <Info lines={[
                    '대상의 격자 칸을 눌러 상태를 바꿉니다.',
                    '금지칸은 없음 → 배정 불가 → 되도록 피함 → 임시 불가 순으로 돌고, 고정 수업은 창체·동아리를 반의 칸에 넣으며, 잠금은 자동 배정이 그 칸을 못 옮기게 합니다.',
                    '임시 불가는 아래 「임시 불가 모두 해제」로 한꺼번에 풉니다.',
                ]} />
                <div className="ml-auto flex items-center gap-2">
                    <Pill tone="accent">{L.blockStates.temp} {tempCount}칸</Pill>
                    <Button variant="ghost" onClick={st.act.clearTempBlocks} disabled={tempCount === 0}>{L.clearTemp}</Button>
                </div>
            </div>

            {mode === 'fixed' && kind === 'track' && (
                <div className="flex items-end gap-2 bg-panel border border-line rounded-md p-2">
                    <label className="text-[12px] text-muted">{L.activity}<br />
                        <Select value={fixActivity} onChange={setFixActivity}>
                            <option value="">(없음)</option>
                            {doc.activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </Select></label>
                    <label className="text-[12px] text-muted">이름표<br />
                        <TextInput value={fixLabel} onChange={(e) => setFixLabel(e.target.value)} placeholder="예: 창체 · 동아리 · 도움반 국어" /></label>
                    <span className="text-[12px] text-muted pb-1.5">빈 칸을 누르면 고정 수업이 들어갑니다.</span>
                </div>
            )}

            {noSpec && <p className="text-[13px] text-warn"><Mark kind="warn" /> 시간 틀이 있어야 격자를 그립니다. 「기초자료 → {L.spec}」에서 만드세요.</p>}

            {/* 반 격자 — 교시 축 */}
            {!noSpec && kind === 'track' && target && trackSpec && (
                <div className="overflow-auto">
                    <table className="border-collapse text-[12px] select-none">
                        <thead>
                            <tr><th className="w-14" />{days.map((d) => <th key={d} className="min-w-[92px] py-1 font-medium text-muted">{dayName(trackSpec, d)}</th>)}</tr>
                        </thead>
                        <tbody>
                            {trackSpec.slots.map((sl) => (
                                <tr key={sl.index}>
                                    <td className="text-right pr-2 text-[11px] text-muted">{sl.label}</td>
                                    {days.map((d) => {
                                        if (!sl.assignable) return <td key={d} className="p-0.5"><div className="h-14 md:h-11 rounded bg-panel2/40 grid place-items-center text-[10px] text-muted/60">{sl.kind === 'lunch' ? '점심' : ''}</div></td>;
                                        // #15 — 그 요일에 없는 교시는 회색·클릭 불가
                                        const exists = lessonOrdinal(trackSpec, sl.index) < lessonCountForDay(trackSpec, d);
                                        if (!exists) return <td key={d} className="p-0.5"><div className="h-14 md:h-11 rounded bg-panel2/30 grid place-items-center text-[10px] text-muted/40">—</div></td>;
                                        const state = blockStateAt(doc, target, { dayIndex: d, slotIndex: sl.index });
                                        const a = cellAt(asgIx, targetId, d, sl.index)[0];
                                        const txt = a ? cellText(a, ix) : null;
                                        return (
                                            <td key={d} className="p-0.5 align-top">
                                                <button onClick={() => onTrackCell(d, sl.index)}
                                                    className={`w-full h-14 md:h-11 rounded border text-left px-1.5 py-1 grid-cell transition-colors ${STATE_STYLE[state]}`}>
                                                    {state !== 'none' && <div className="text-[10px] font-medium">{STATE_LABEL[state]}</div>}
                                                    {txt && (
                                                        <div className="leading-tight">
                                                            <div className="truncate text-text flex items-center gap-1">{a?.pinned && <span title={L.pinned}>📌</span>}{a?.fixed && <span title={L.fixedLesson}>🔒</span>}{txt.top}</div>
                                                            {txt.bottom && <div className="truncate text-muted text-[10px]">{txt.bottom}</div>}
                                                        </div>
                                                    )}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <Legend />
                </div>
            )}

            {/* 교사·특별실 격자 — 시각 축 */}
            {!noSpec && kind !== 'track' && target && (
                <div className="overflow-auto">
                    <table className="border-collapse text-[12px] select-none">
                        <thead>
                            <tr><th className="w-24" />{days.map((d) => <th key={d} className="min-w-[92px] py-1 font-medium text-muted">{dayName(doc.specs[0], d)}</th>)}</tr>
                        </thead>
                        <tbody>
                            {starts.map((start) => {
                                const lunch = lunchAt(doc.specs, start);
                                return (
                                    <tr key={start}>
                                        <td className="text-right pr-2 text-[11px] align-top">
                                            <div className="text-muted">{start}</div>
                                            {lunch && <div className="text-[9px] text-muted/60 leading-tight">{lunch}</div>}
                                        </td>
                                        {days.map((d) => {
                                            const state = blockStateAt(doc, target, { dayIndex: d, from: start });
                                            return (
                                                <td key={d} className="p-0.5 align-top relative">
                                                    <button onClick={() => onTimeCell(d, start)}
                                                        className={`w-full h-11 rounded border text-left px-1.5 py-1 grid-cell transition-colors ${STATE_STYLE[state]}`}>
                                                        {state !== 'none' && <div className="text-[10px] font-medium">{STATE_LABEL[state]}</div>}
                                                        {lunch && state === 'none' && <div className="text-[9px] text-muted/40">점심 겹침</div>}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <Legend />
                </div>
            )}
        </div>
    );
}

function Legend() {
    return (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-bad/40 inline-block" /> {L.blockStates.ban}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warn/40 inline-block" /> {L.blockStates.avoid}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent/40 inline-block" /> {L.blockStates.temp}</span>
            <span>📌 {L.pin} · 🔒 {L.fixedLesson}</span>
        </div>
    );
}
