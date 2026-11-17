/**
 * 「자동 편성 엔진」 플러그인 — 화면 없음. 약속 solver 를 채우기만 한다(1.2v 편성기 분해 F1).
 *   🔴 화면은 엔진을 모른다 — host.modules.use<Solver>('solver') 로만 부른다(설계 2절 3번).
 *   편성 입력 조립(read-canon.ts · F5b)은 정본을 읽기만 한다 — 막힘이 있으면 상태바 귀퉁이에 「편성 막힘 N건」(BlockersBadge).
 *   자동 편성 화면(views/SolverTab)은 편성안을 plans 약속(savePlan)으로만 담는다(U20 F6).
 *   ⛔ 규칙 낱개 기여는 F2 몫이다.
 */
import { definePlugin, type PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { createElement } from 'react';
import { solverApi } from './api';
import { BlockersBadge } from './BlockersBadge';
import { SolverTab } from './views/SolverTab';

export const timetableSolverPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { solver: '0.1.0' },
        // 정본은 없어도 켜진다(없으면 「꺼져 있어 읽을 수 없습니다」가 편성 막힘으로 보인다)
        supports: { nodes: '^0.1', staff: '^0.1', school: '^0.1', subjects: '^0.1', rooms: '^0.1', clock: '^0.1', duty: '^0.1', plans: '^0.1' },
        contributes: {
            views: [{
                id: 'auto', title: '자동 편성', icon: 'schedule', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 320, squeeze: 'scroll' },
                component: 'Auto',
            }],
            commands: [{ id: 'timetable-solver.open', title: '자동 편성 열기', icon: 'schedule' }],
            ribbon: [{ commandId: 'timetable-solver.open', icon: 'schedule', order: 8 }],
            statusBar: [{ id: 'timetable-solver.blockers', side: 'right', render: 'Blockers' }],
            interfaces: [{ name: 'solver', version: '0.1.0', label: '자동 편성 엔진', desc: '시간표 자동 편성·겹침 점검·옮기기 판정' }],
        },
    },
    modules: { solver: solverApi },
    components: { Auto: ({ host }) => createElement(SolverTab, { host }) },
    commands: { 'timetable-solver.open': (host: PluginHost) => { host.workspace.open('timetable-solver.auto', { where: 'center' }); } },
    renders: { Blockers: (host) => createElement(BlockersBadge, { host }) },
});

export default timetableSolverPlugin;
