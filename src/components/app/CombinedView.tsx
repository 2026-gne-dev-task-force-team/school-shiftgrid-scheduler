/**
 * 통합 조회 — 흩어진 학반별 배치를 '한 표'로 합쳐 필터링해 본다.
 * (저장 모델에서 계산해낸 읽기 전용 뷰 = derived의 정신. 여기선 저장 안 하고 그때그때 만든다.)
 */
import { useState, type ReactNode } from 'react';
import { useStore } from '../../store/store';
import { indexBy } from '../../logic/logic';

const DAY_LABEL = ['월', '화', '수', '목', '금', '토', '일'];

export default function CombinedView() {
    const { doc, setUI } = useStore();
    const [track, setTrack] = useState('');
    const [agent, setAgent] = useState('');
    const [activity, setActivity] = useState('');

    const tracks = indexBy(doc.tracks);
    const agents = indexBy(doc.agents);
    const activities = indexBy(doc.activities);
    const resources = indexBy(doc.resources);

    const rows = doc.assignments
        .filter((a) => (!track || a.trackId === track) && (!agent || a.agentId === agent) && (!activity || a.activityId === activity))
        .sort((a, b) => a.trackId.localeCompare(b.trackId) || a.dayIndex - b.dayIndex || a.slotIndex - b.slotIndex);

    const sel = 'border border-slate-200 rounded px-2 py-1 text-xs';

    return (
        <Overlay onClose={() => setUI({ overlay: 'none' })} title="통합 조회">
            <div className="flex flex-wrap gap-2 mb-3">
                <select className={sel} value={track} onChange={(e) => setTrack(e.target.value)}>
                    <option value="">전체 학반</option>
                    {doc.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className={sel} value={agent} onChange={(e) => setAgent(e.target.value)}>
                    <option value="">전체 교사</option>
                    {doc.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select className={sel} value={activity} onChange={(e) => setActivity(e.target.value)}>
                    <option value="">전체 교과</option>
                    {doc.activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <span className="ml-auto text-xs text-slate-400 self-center">{rows.length}건</span>
            </div>
            <div className="overflow-auto max-h-[60vh] border border-slate-200 rounded">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                        <tr className="text-slate-500">
                            {['학반', '요일', '교시', '교과', '교사', '시설'].map((h) => (
                                <th key={h} className="text-left font-semibold px-3 py-2 border-b border-slate-200">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((a) => (
                            <tr key={a.id} className="hover:bg-slate-50">
                                <td className="px-3 py-1.5 border-b border-slate-100">{tracks.get(a.trackId)?.name}</td>
                                <td className="px-3 py-1.5 border-b border-slate-100">{DAY_LABEL[a.dayIndex] ?? `${a.dayIndex + 1}일차`}</td>
                                <td className="px-3 py-1.5 border-b border-slate-100">{a.slotIndex + 1}교시</td>
                                <td className="px-3 py-1.5 border-b border-slate-100">{a.activityId ? activities.get(a.activityId)?.name : '—'}</td>
                                <td className="px-3 py-1.5 border-b border-slate-100">{a.agentId ? agents.get(a.agentId)?.name : '—'}</td>
                                <td className="px-3 py-1.5 border-b border-slate-100">{a.resourceId ? resources.get(a.resourceId)?.name : '—'}</td>
                            </tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">해당하는 배치가 없습니다</td></tr>}
                    </tbody>
                </table>
            </div>
        </Overlay>
    );
}

export function Overlay({ title, onClose, children, size = '3xl' }: {
    title: string; onClose: () => void; children: ReactNode; size?: 'md' | '3xl';
}) {
    return (
        <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-6" onClick={onClose}>
            <div className={`bg-white rounded-xl shadow-2xl w-full ${size === 'md' ? 'max-w-md' : 'max-w-3xl'} max-h-[85vh] overflow-hidden flex flex-col`} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <h2 className="text-sm font-bold text-slate-800">{title}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">×</button>
                </div>
                <div className="p-4 overflow-auto">{children}</div>
            </div>
        </div>
    );
}
