/** 배정/필요 현황 — 남음 파랑·초과 빨강·완료 회색. 6학년→1학년 */
import { useStore } from '../../../store/store';
import { indexBy } from '../../lib';
import { HOMEROOM_AGENT_ID, HOMEROOM_LABEL } from '../../../types/schema';
import { Info, Pill } from '../../parts/ui';

export default function DemandStatusPanel() {
    const st = useStore();
    const tracks = indexBy(st.doc.tracks);
    const agents = indexBy(st.doc.agents);
    const activities = indexBy(st.doc.activities);
    const nothingPlaced = st.demand.every((d) => d.placed === 0);   // 시수가 하나도 안 놓였다(자동 배정 전)

    const agentName = (id: string) => (id === HOMEROOM_AGENT_ID ? HOMEROOM_LABEL : agents.get(id)?.name ?? '교사?');

    // 반 학년 내림차순으로 묶는다
    const rows = st.demand.slice().sort((a, b) => {
        const ga = tracks.get(a.trackId)?.grade ?? 0;
        const gb = tracks.get(b.trackId)?.grade ?? 0;
        if (gb !== ga) return gb - ga;
        return (tracks.get(a.trackId)?.name ?? '').localeCompare(tracks.get(b.trackId)?.name ?? '');
    });

    return (
        <div data-tour="demand-status">
            <div className="flex items-center gap-1.5 text-[13px] font-medium mb-2">
                배정 / 필요
                {rows.length > 0 && nothingPlaced && <Pill tone="accent">아직 배정 전</Pill>}
                <Info lines={[
                    '「남음」은 시간표에 아직 놓이지 않은 시간입니다.',
                    '자동 배정 전에는 모두 남음이 정상입니다.',
                    '「초과」는 필요보다 많이 놓인 것입니다.',
                ]} />
            </div>
            {rows.length === 0 && (
                <p className="text-[12px] text-muted">시수표가 채워지면 여기에 반별 배정/필요가 뜹니다.</p>
            )}
            <div className="space-y-1">
                {rows.map((d) => {
                    const tone = d.remaining > 0 ? 'text-accenth' : d.remaining < 0 ? 'text-bad' : 'text-muted';
                    return (
                        <div key={d.demandId} className="flex items-center gap-2 text-[12px]">
                            <span className="flex-1 truncate">
                                {tracks.get(d.trackId)?.name ?? '반?'} · {activities.get(d.activityId)?.name ?? '과목?'}
                                <span className="text-muted"> ({agentName(d.agentId)})</span>
                            </span>
                            <span className={tone}>{d.placed}/{d.need}</span>
                            <span className={`w-12 text-right ${tone}`}>
                                {d.remaining > 0 ? `남음 ${d.remaining}` : d.remaining < 0 ? `초과 ${-d.remaining}` : '완료'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
