/**
 * 「v1 파일로 내보내기」 화면 — 편성안을 고르고 단추 하나로 작업 파일을 내려받는다(F10b).
 *   🔴 정본·편성안은 약속으로만 읽는다(solver.readInput · plans.listPlans/getPlan) · 여기엔 저장하지 않는다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Select } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { Solver } from '../../timetable-solver/contracts/solver';
import type { Plans, PlanListItem } from '../../timetable-plans/contracts/plans';
import { downloadText, exportV1, v1FileName, v1FileText } from '../export-v1';
import { loadExtras } from '../extras-store';

const NO_PLAN = '';

export function ExportTab({ host }: { host: PluginHost }) {
    const solver = host.modules.use<Solver>('solver');
    const plansApi = host.modules.use<Plans>('plans');
    const [plans, setPlans] = useState<PlanListItem[]>(() => plansApi?.listPlans() ?? []);
    const [picked, setPicked] = useState<string>(NO_PLAN);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!plansApi) return undefined;
        const refresh = () => setPlans(plansApi.listPlans());
        refresh();
        return plansApi.subscribe(refresh);
    }, [plansApi]);

    const chosen = useMemo(() => plans.find((n) => n.chosen)?.id ?? NO_PLAN, [plans]);
    const current = picked || chosen;

    const options = [
        { value: NO_PLAN, label: '안 넣기(배치 없는 파일)' },
        ...plans.map((n) => ({ value: n.id, label: `${n.chosen ? '✔ ' : ''}${n.name}` })),
    ];

    if (!solver || !plansApi) {
        return <EmptyState icon="file" title="내보낼 수 없습니다" description="자동 편성 엔진이나 편성안 보관이 꺼져 있습니다. 플러그인이 켜져 있는지 확인해 주세요." />;
    }

    const run = async () => {
        const input = solver.readInput();
        if (!input) { setMsg('정본(교직원·학교·과목·시수표·일과표)을 읽지 못해 내보낼 수 없습니다.'); return; }
        const plan = current ? plansApi.getPlan(current) : null;
        const extras = await loadExtras(host);
        const { doc, issues } = exportV1(input, { solver, plan, extras });
        const name = v1FileName(doc.meta.name);
        downloadText(name, v1FileText(doc));
        setMsg(`${name} 을(를) 내려받았습니다.${issues.length ? ` 빠진 칸 ${issues.length}건: ${issues.join(' / ')}` : ''}`);
    };

    return (
        <div className="h-full overflow-auto p-3 flex flex-col gap-3">
            <p>지금 정본(교직원·학교·과목·시수표·일과표 …)과 고른 편성안으로 예전 앱(v1) 작업 파일 하나를 만듭니다.</p>
            <Select aria-label="넣을 편성안" value={current} onChange={(e) => setPicked(e.target.value)} options={options} />
            <div><Button variant="accent" onClick={() => { void run(); }}>v1 파일로 내보내기</Button></div>
            {msg && <p role="status">{msg}</p>}
        </div>
    );
}
