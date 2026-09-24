/** 특별작업 — 대상의 요일×교시 격자에서 배정금지·회피·임시금지 순환, 고정 수업, 이동금지(pin) */
import { useState } from 'react';
import { useStore } from '../../store/store';
import type { TargetRef } from '../../types/schema';
import { blockStateAt, type BlockState } from '../../store/doc-ops';
import { indexBy, indexAssignments, cellKey, dayName, activeDays, cellText } from '../lib';
import { Button, Select, Mark, Info, TextInput, Pill } from '../parts/ui';

type Mode = 'block' | 'fixed' | 'pin';

const STATE_STYLE: Record<BlockState, string> = {
    none: 'bg-panel2 hover:bg-line border-line',
    ban: 'bg-bad/20 border-bad/50 text-bad',
    avoid: 'bg-warn/20 border-warn/50 text-warn',
    temp: 'bg-accent/20 border-accent/50 text-accenth',
};
const STATE_LABEL: Record<BlockState, string> = { none: '', ban: '배정금지', avoid: '회피', temp: '임시금지' };

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

    // 격자 규격: 반이면 그 반 규격, 아니면 첫(가장 큰) 규격
    const spec = kind === 'track'
        ? doc.specs.find((s) => s.id === doc.tracks.find((t) => t.id === targetId)?.specId)
        : doc.specs.slice().sort((a, b) => b.slots.length - a.slots.length)[0];

    const ix = { agents: indexBy(doc.agents), activities: indexBy(doc.activities), resources: indexBy(doc.resources), tracks: indexBy(doc.tracks) };
    const asgIx = indexAssignments(doc.assignments);
    const tempCount = doc.weeklyBlocks.filter((w) => w.temp).length;

    const onCell = (day: number, slotIndex: number) => {
        if (!target) return;
        if (mode === 'block') { st.act.cycleBlock(target, day, slotIndex); return; }
        if (kind !== 'track') return;
        const pos = { trackId: targetId, dayIndex: day, slotIndex };
        const a = asgIx.get(cellKey(targetId, day, slotIndex));
        if (mode === 'fixed') {
            if (a) return; // 이미 있으면 안 덮는다
            st.act.addFixed(pos, fixActivity || undefined, fixLabel || (fixActivity ? ix.activities.get(fixActivity)?.name ?? '고정' : '고정'));
        } else if (mode === 'pin') {
            if (a) st.act.togglePin(a.id);
        }
    };

    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <Select value={kind} onChange={(v) => { setKind(v as never); setId(''); if (v !== 'track' && mode !== 'block') setMode('block'); }}>
                    <option value="track">반</option><option value="agent">교사</option><option value="resource">특별실</option>
                </Select>
                <Select value={targetId} onChange={setId}>
                    {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                <div className="w-px h-6 bg-line mx-1" />
                <div className="flex rounded-md overflow-hidden border border-line">
                    {(['block', 'fixed', 'pin'] as Mode[]).map((m) => {
                        const label = m === 'block' ? '금지칸' : m === 'fixed' ? '고정 수업' : '이동금지';
                        const dis = m !== 'block' && kind !== 'track';
                        return (
                            <button key={m} disabled={dis} onClick={() => setMode(m)}
                                className={`px-2.5 py-1.5 text-[12px] disabled:opacity-30 ${mode === m ? 'bg-accent text-white' : 'bg-panel2 text-muted hover:text-text'}`}>{label}</button>
                        );
                    })}
                </div>
                <Info lines={[
                    '대상의 요일×교시 칸을 눌러 상태를 바꿉니다.',
                    '금지칸은 없음→배정금지→회피→임시금지 순으로 돌고, 고정 수업은 담임 국·수·창체를 칸에 박고, 이동금지는 자동배정이 그 칸을 못 옮기게 잠급니다.',
                    '임시금지는 아래 「임시금지 전부 풀기」로 한꺼번에 풉니다.',
                ]} />
                <div className="ml-auto flex items-center gap-2">
                    <Pill tone="accent">임시금지 {tempCount}칸</Pill>
                    <Button variant="ghost" onClick={st.act.clearTempBlocks} disabled={tempCount === 0}>임시금지 전부 풀기</Button>
                </div>
            </div>

            {mode === 'fixed' && kind === 'track' && (
                <div className="flex items-end gap-2 bg-panel border border-line rounded-md p-2">
                    <label className="text-[12px] text-muted">과목<br />
                        <Select value={fixActivity} onChange={setFixActivity}>
                            <option value="">(없음)</option>
                            {doc.activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </Select></label>
                    <label className="text-[12px] text-muted">이름표<br />
                        <TextInput value={fixLabel} onChange={(e) => setFixLabel(e.target.value)} placeholder="예: 창체 · 동아리 · 도움반 국어" /></label>
                    <span className="text-[12px] text-muted pb-1.5">빈 칸을 누르면 고정 수업이 박힙니다.</span>
                </div>
            )}

            {!spec && <p className="text-[13px] text-warn"><Mark kind="warn" /> 규격이 있어야 격자를 그립니다. 「기초자료 → 시간 틀」에서 만드세요.</p>}
            {spec && target && (
                <div className="overflow-auto">
                    <table className="border-collapse text-[12px] select-none">
                        <thead>
                            <tr>
                                <th className="w-14" />
                                {activeDays(spec).map((d) => <th key={d} className="min-w-[92px] py-1 font-medium text-muted">{dayName(spec, d)}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {spec.slots.map((sl) => (
                                <tr key={sl.index}>
                                    <td className="text-right pr-2 text-[11px] text-muted">{sl.label}</td>
                                    {activeDays(spec).map((d) => {
                                        if (!sl.assignable) return <td key={d} className="p-0.5"><div className="h-11 rounded bg-panel2/40 grid place-items-center text-[10px] text-muted/60">{sl.kind === 'lunch' ? '점심' : ''}</div></td>;
                                        const state = blockStateAt(doc, target, d, sl.index);
                                        const a = kind === 'track' ? asgIx.get(cellKey(targetId, d, sl.index)) : undefined;
                                        const txt = a ? cellText(a, ix) : null;
                                        return (
                                            <td key={d} className="p-0.5 align-top">
                                                <button onClick={() => onCell(d, sl.index)}
                                                    className={`w-full h-11 rounded border text-left px-1.5 py-1 grid-cell transition-colors ${STATE_STYLE[state]}`}>
                                                    {state !== 'none' && <div className="text-[10px] font-medium">{STATE_LABEL[state]}</div>}
                                                    {txt && (
                                                        <div className="leading-tight">
                                                            <div className="truncate text-text flex items-center gap-1">{a?.pinned && <span title="이동금지">📌</span>}{a?.fixed && <span title="고정">🔒</span>}{txt.top}</div>
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
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-bad/40 inline-block" /> 배정금지</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warn/40 inline-block" /> 회피</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent/40 inline-block" /> 임시금지</span>
                        <span>📌 이동금지 · 🔒 고정</span>
                    </div>
                </div>
            )}
        </div>
    );
}
