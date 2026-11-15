/**
 * 「근태」 플러그인 — 화면 하나(근태) · 명령 하나(리본). 자료는 source 한 창구.
 * 상태바 「14일 안 재배정 필요」 배지(AuxStatus) — 값은 `reassignNeededCount`(ops.ts), 0건이면 숨긴다.
 */
import { createElement, type FunctionComponent } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { AuxPanel } from './AuxPanel';
import { AuxStatus, type AuxStatusProps } from './AuxStatus';

export { reassignNeededCount } from './ops';

export const opsAuxPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: [{ id: 'aux', title: '근태', icon: 'users', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Aux' }],
            statusBar: [{ id: 'ops-aux.badge', side: 'right', render: 'AuxStatus' }],
            commands: [{ id: 'ops-aux.open', title: '근태 열기', icon: 'users' }],
            ribbon: [{ commandId: 'ops-aux.open', icon: 'users', order: 11 }],
        },
    },
    components: { Aux: () => createElement(AuxPanel) },
    renders: { AuxStatus: (host: PluginHost) => createElement(AuxStatus as FunctionComponent<AuxStatusProps>, { onOpen: () => { host.commands.run('ops-aux.open'); } }) },
    commands: { 'ops-aux.open': (host: PluginHost) => { host.workspace.open('ops-aux.aux', { where: 'center' }); } },
});

export default opsAuxPlugin;
