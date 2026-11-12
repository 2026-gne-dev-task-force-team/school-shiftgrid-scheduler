/**
 * 「보결 목록·내 것」 플러그인 — 화면 둘(목록 · 내 것) · 명령 둘(리본). 자료는 list/source 한 창구.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { ListPanel, MinePanel } from './ListPanels';

export const opsSubPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: [
                { id: 'list', title: '보결 목록', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'List' },
                { id: 'mine', title: '내 보결', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Mine' },
            ],
            commands: [
                { id: 'ops-sub.open-list', title: '보결 목록 열기', icon: 'list' },
                { id: 'ops-sub.open-mine', title: '내 보결 열기', icon: 'list' },
            ],
            ribbon: [{ commandId: 'ops-sub.open-mine', icon: 'list', order: 8 }],
        },
    },
    components: { List: () => createElement(ListPanel), Mine: () => createElement(MinePanel) },
    commands: {
        'ops-sub.open-list': (host: PluginHost) => { host.workspace.open('ops-sub.list', { where: 'center' }); },
        'ops-sub.open-mine': (host: PluginHost) => { host.workspace.open('ops-sub.mine', { where: 'center' }); },
    },
});

export default opsSubPlugin;
