/**
 * 「특별실 관리」 플러그인 — 화면 하나(관리) · 명령 하나(리본). 예약은 room-booking 이 맡고, 여기는 옛 예약 이사(book/boot)만 남는다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { RoomManagePanel } from './manage';
import { initRoomMigration } from './book/boot';
import { opsRoomApi } from './api';

let migrationSub: { dispose(): void } | null = null;
const restart = (host: PluginHost) => { migrationSub?.dispose(); migrationSub = initRoomMigration(host); };

export const opsRoomPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { 'ops-room': '0.1.0' },
        contributes: {
            interfaces: [{ name: 'ops-room', version: '0.1.0', label: '특별실 관리', desc: '특별실 관리 화면 열기 명령 id' }],
            views: [
                { id: 'manage', title: '특별실 관리', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Manage' },
            ],
            commands: [{ id: 'ops-room.open-manage', title: '특별실 관리 열기', icon: 'list' }],
            ribbon: [{ commandId: 'ops-room.open-manage', icon: 'list', order: 10 }],
        },
    },
    modules: { 'ops-room': opsRoomApi },
    components: { Manage: ({ host }: { host: PluginHost }) => createElement(RoomManagePanel, { host }) },
    commands: {
        'ops-room.open-manage': (host: PluginHost) => { host.workspace.open('ops-room.manage', { where: 'center' }); },
    },
    // 🔴 T-10f7 — 옛 예약(localStorage)을 달력 일정으로 기동 때 옮긴다(약속이 꺼져 있으면 미룸 · 두 번 돌아도 같음).
    lifecycle: {
        onActivate(host: PluginHost) { restart(host); },
        onDeactivate() { migrationSub?.dispose(); migrationSub = null; },
        // 약속이 활성 뒤에 켜져도 따라잡는다 — 다시 시도(멱등).
        onInterface: Object.fromEntries(['calendar', 'rooms', 'nodes', 'room-booking'].map((n) => [n, { attach: restart, detach: () => undefined }])),
    },
});

export default opsRoomPlugin;
