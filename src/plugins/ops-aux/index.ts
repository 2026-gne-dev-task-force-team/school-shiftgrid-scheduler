/**
 * 「근태」 플러그인 — 화면 하나(근태) · 명령 하나(리본). 자료는 source 한 창구.
 * 상태바 「14일 안 재배정 필요」 배지(AuxStatus) — 값은 `reassignNeededCount`(ops.ts), 0건이면 숨긴다.
 */
import { createElement, type FunctionComponent } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Staff } from '../staff/contracts/staff';
import { manifest } from './manifest';
import { AuxPanel } from './AuxPanel';
import type { PartStore } from './source';
import { requestAssignTab } from './auxTab';
import { initAuxMigration } from './boot';
import { AuxStatus, type AuxStatusProps } from './AuxStatus';

export { reassignNeededCount } from './ops';

let migrationSub: { dispose(): void } | null = null;
const restart = (host: PluginHost) => { migrationSub?.dispose(); migrationSub = initAuxMigration(host); };

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
    // 교직원 명단(staff)이 켜져 있으면 명부를 거기서 읽는다(없으면 옛 근태 명부).
    components: { Aux: ({ host }: { host: PluginHost }) => createElement(AuxPanel as FunctionComponent<{ staff?: Staff; store?: PartStore }>, { staff: host.modules.use<Staff>('staff') ?? undefined, store: host.storage }) },
    renders: { AuxStatus: (host: PluginHost) => createElement(AuxStatus as FunctionComponent<AuxStatusProps>, { store: host.storage, onOpen: () => { host.commands.run('ops-aux.open'); requestAssignTab(); } }) },
    commands: { 'ops-aux.open': (host: PluginHost) => { host.workspace.open('ops-aux.aux', { where: 'center' }); } },
    // 🔴 T-10f7 — 옛 명부(localStorage)를 교직원 명단으로 기동 때 옮긴다(약속이 꺼져 있으면 미룸 · 두 번 돌아도 같음).
    lifecycle: {
        onActivate(host: PluginHost) { restart(host); },
        onDeactivate() { migrationSub?.dispose(); migrationSub = null; },
        onInterface: Object.fromEntries(['nodes', 'staff'].map((n) => [n, { attach: restart, detach: () => undefined }])),
    },
});

export default opsAuxPlugin;
