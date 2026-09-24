/** 시수표 — 교사|반|과목|시수|특별실|특별실시수|연강|순배. 행 추가·복제·삭제, 반 여러 개 한 번에 */
import { useState } from 'react';
import { useStore } from '../../../store/store';
import { Button, Select, TextInput, ConfirmButton, Info, Card } from '../../parts/ui';
import { Icon } from '../../parts/Icon';

export default function DemandTable() {
    const st = useStore();
    const { doc } = st;
    const agents = doc.agents; const acts = doc.activities; const tracks = doc.tracks; const rooms = doc.resources;

    const ready = agents.length > 0 && acts.length > 0 && tracks.length > 0;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-[13px] font-medium">
                시수표
                <Info lines={[
                    '교사 한 명이 어느 반에 어느 과목을 주 몇 시간 하는지 한 줄로 적습니다.',
                    '엑셀 교사별 시수표 한 줄이 곧 여기 여러 줄(반마다 하나)이 됩니다.',
                    '연강·순배·특별실은 각 칸에서 켭니다.',
                ]} />
            </div>
            {!ready && <p className="text-[13px] text-warn">교사·과목·반을 먼저 만들어야 시수표를 채울 수 있습니다.</p>}

            <div className="overflow-auto">
                <table className="text-[12px] border-collapse min-w-[820px]">
                    <thead>
                        <tr className="text-muted text-left">
                            {['교사', '반', '과목', '시수', '특별실', '특별실시수', '연강', '순배', ''].map((h) => (
                                <th key={h} className="border-b border-line px-2 py-1.5 font-medium">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {doc.demands.map((d) => (
                            <tr key={d.id} className="hover:bg-panel2/50">
                                <td className="px-1 py-1 border-b border-line/60">
                                    <Select value={d.agentId} onChange={(v) => st.act.updateDemand(d.id, { agentId: v })}>
                                        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </Select>
                                </td>
                                <td className="px-1 py-1 border-b border-line/60">
                                    <Select value={d.trackId} onChange={(v) => st.act.updateDemand(d.id, { trackId: v })}>
                                        {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </Select>
                                </td>
                                <td className="px-1 py-1 border-b border-line/60">
                                    <Select value={d.activityId} onChange={(v) => st.act.updateDemand(d.id, { activityId: v })}>
                                        {acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </Select>
                                </td>
                                <td className="px-1 py-1 border-b border-line/60">
                                    <TextInput type="number" value={d.count} onChange={(e) => st.act.updateDemand(d.id, { count: +e.target.value })} className="w-14" />
                                </td>
                                <td className="px-1 py-1 border-b border-line/60">
                                    <Select value={d.resourceId ?? ''} onChange={(v) => st.act.updateDemand(d.id, { resourceId: v || undefined })}>
                                        <option value="">없음</option>
                                        {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </Select>
                                </td>
                                <td className="px-1 py-1 border-b border-line/60">
                                    <TextInput type="number" value={d.roomHours ?? ''} placeholder="전부"
                                        onChange={(e) => st.act.updateDemand(d.id, { roomHours: e.target.value === '' ? undefined : +e.target.value })} className="w-14" disabled={!d.resourceId} />
                                </td>
                                <td className="px-1 py-1 border-b border-line/60">
                                    <TextInput value={(d.block ?? []).join(',')} placeholder="예: 2,2"
                                        onChange={(e) => st.act.updateDemand(d.id, { block: parseBlock(e.target.value) })} className="w-16"
                                        title="연강 묶음. 비우면 없음. 예: 2 는 2시간 붙여서, 2,2 는 2+2" />
                                </td>
                                <td className="px-1 py-1 border-b border-line/60 text-center">
                                    <input type="checkbox" checked={!!d.cycle} onChange={(e) => st.act.updateDemand(d.id, { cycle: e.target.checked })} title="순배(라운드로빈)" />
                                </td>
                                <td className="px-1 py-1 border-b border-line/60 whitespace-nowrap">
                                    <button className="text-muted hover:text-text p-1" title="복제" onClick={() => st.act.duplicateDemand(d.id)}><Icon name="copy" size={14} /></button>
                                    <ConfirmButton onConfirm={() => st.act.removeDemand(d.id)} iconOnly />
                                </td>
                            </tr>
                        ))}
                        {doc.demands.length === 0 && (
                            <tr><td colSpan={9} className="px-2 py-3 text-muted">아직 시수가 없습니다. 아래에서 추가하세요.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {ready && <BulkAdd />}
            <p className="text-[11px] text-muted">연강 칸: 비우면 없음 · <code className="text-text">2</code> 2시간 붙여서 · <code className="text-text">2,2</code> 2+2 두 묶음. 순배는 같은 교사·학년·과목의 모든 반이 1차시를 끝내야 2차시로 갑니다.</p>
        </div>
    );
}

function BulkAdd() {
    const st = useStore();
    const agents = st.doc.agents; const acts = st.doc.activities; const tracks = st.doc.tracks;
    const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
    const [activityId, setActivityId] = useState(acts[0]?.id ?? '');
    const [count, setCount] = useState(1);
    const [picked, setPicked] = useState<string[]>([]);
    const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    const add = () => {
        if (!agentId || !activityId || picked.length === 0) return;
        st.act.addDemandsBulk({ agentId, activityId, count }, picked);
        setPicked([]);
    };
    return (
        <Card className="p-3">
            <div className="text-[13px] font-medium mb-2">반 여러 개에 한 번에 추가</div>
            <div className="flex items-end gap-2 flex-wrap">
                <label className="text-[12px] text-muted">교사<br />
                    <Select value={agentId} onChange={setAgentId}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></label>
                <label className="text-[12px] text-muted">과목<br />
                    <Select value={activityId} onChange={setActivityId}>{acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></label>
                <label className="text-[12px] text-muted">시수<br />
                    <TextInput type="number" value={count} onChange={(e) => setCount(+e.target.value)} className="w-16" /></label>
                <div className="flex-1">
                    <div className="text-[12px] text-muted mb-1">반 고르기</div>
                    <div className="flex flex-wrap gap-1">
                        {tracks.slice().sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0)).map((t) => (
                            <button key={t.id} onClick={() => toggle(t.id)}
                                className={`text-[11px] px-1.5 py-0.5 rounded ${picked.includes(t.id) ? 'bg-accent/25 text-accenth' : 'bg-panel2 text-muted'}`}>
                                {t.name}
                            </button>
                        ))}
                    </div>
                </div>
                <Button variant="primary" icon="plus" onClick={add} disabled={picked.length === 0}>{picked.length}개 반에 추가</Button>
            </div>
        </Card>
    );
}

function parseBlock(s: string): number[] | undefined {
    const nums = s.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    return nums.length ? nums : undefined;
}
