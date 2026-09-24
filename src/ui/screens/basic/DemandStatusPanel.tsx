/** 배정/필요 현황 — 남은 시간 파랑·초과 빨강·완료 회색. 6학년→1학년 */
import { useStore } from '../../../store/store';
import { indexBy } from '../../lib';
import { Info } from '../../parts/ui';

export default function DemandStatusPanel() {
    const st = useStore();
    const tracks = indexBy(st.doc.tracks);
    const agents = indexBy(st.doc.agents);
    const activities = indexBy(st.doc.activities);

    // 반 학년 내림차순으로 묶는다
    const rows = st.demand.slice().sort((a, b) => {
        const ga = tracks.get(a.trackId)?.grade ?? 0;
        const gb = tracks.get(b.trackId)?.grade ?? 0;
        if (gb !== ga) return gb - ga;
        return (tracks.get(a.trackId)?.name ?? '').localeCompare(tracks.get(b.trackId)?.name ?? '');
    });

    return (
        <div>
            <div className="flex items-center gap-1.5 text-[13px] font-medium mb-2">
                배정 / 필요
                <Info lines={[
                    '시수 목표(필요) 대비 지금 배정한 시간을 반별로 봅니다.',
                    '남은 게 있으면 아직 덜 넣은 것이고, 초과면 너무 많이 넣은 것입니다.',
                    '숫자를 채우려면 생성·편집에서 배치합니다.',
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
                                <span className="text-muted"> ({agents.get(d.agentId)?.name ?? '교사?'})</span>
                            </span>
                            <span className={tone}>{d.placed}/{d.need}</span>
                            <span className={`w-10 text-right ${tone}`}>
                                {d.remaining > 0 ? `남 ${d.remaining}` : d.remaining < 0 ? `초 ${-d.remaining}` : '완료'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
