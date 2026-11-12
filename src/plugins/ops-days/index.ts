/**
 * 「학사」 플러그인 — 화면 하나(학사) · 명령 하나(리본). 자료는 source 한 창구.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { DaysPanel } from './DaysPanel';

export const opsDaysPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: [{ id: 'days', title: '학사', icon: 'calendar', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Days' }],
            commands: [{ id: 'ops-days.open', title: '학사 열기', icon: 'calendar' }],
            ribbon: [{ commandId: 'ops-days.open', icon: 'calendar', order: 10 }],
        },
    },
    components: { Days: () => createElement(DaysPanel) },
    commands: { 'ops-days.open': (host: PluginHost) => { host.workspace.open('ops-days.days', { where: 'center' }); } },
});

export default opsDaysPlugin;
