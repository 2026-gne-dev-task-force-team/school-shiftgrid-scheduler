/**
 * 「편성안」 플러그인 — 편성안(timetable-plans.plan) 노드 하나 + 편성안 화면 하나(1.2v 편성기 분해 F7).
 *   선언형(demand-table 과 같은 결) — onActivate 엔 노드 다리만.
 *   고른 안은 격자(timetable-grid)의 시간표 노드(글자 칸)로 풀어 보낸다 — 격자 쪽 코드는 그대로.
 *   ⛔ 약속(provides)은 아직 없다 — 편성기(F5)가 안을 저장할 때 savePlan 을 쓰도록 이어 줄 때 정한다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import { manifest } from './manifest';
import { PlansTab } from './views/PlansTab';
import { planNodeTypes, planNodeTypeImpl, initPlans } from './nodes';

const VIEW_ID = 'timetable-plans.plans';

export const timetablePlansPlugin = definePlugin({
    manifest: {
        ...manifest,
        requires: { nodes: '^0.1' },
        supports: { staff: '^0.1', school: '^0.1', subjects: '^0.1', rooms: '^0.1' },
        contributes: {
            views: [{
                id: 'plans', title: '편성안', icon: 'layers', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 320, squeeze: 'scroll' },
                component: 'Plans',
            }],
            commands: [{ id: 'timetable-plans.open', title: '편성안 열기', icon: 'layers' }],
            ribbon: [{ commandId: 'timetable-plans.open', icon: 'layers', order: 7 }],
            nodeTypes: planNodeTypes,
        },
    },

    components: {
        Plans: ({ host }) => createElement(PlansTab, { host }),
    },
    commands: {
        'timetable-plans.open': (host: PluginHost) => { host.workspace.open(VIEW_ID, { where: 'center' }); },
    },
    nodeTypes: planNodeTypeImpl,

    lifecycle: {
        onActivate(host: PluginHost) { initPlans(host.modules.use<NodesApi>('nodes') ?? null); },
    },
});

export default timetablePlansPlugin;
