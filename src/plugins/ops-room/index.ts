/**
 * 「특별실 예약」 플러그인 — 화면 하나(예약) · 명령 하나(리본). 자료는 book/source 한 창구.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { RoomPanel } from './RoomPanel';
import { RoomManagePanel } from './manage';
import { initRoomMigration } from './book/boot';

let migrationSub: { dispose(): void } | null = null;
const restart = (host: PluginHost) => { migrationSub?.dispose(); migrationSub = initRoomMigration(host); };

export const opsRoomPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: [
                { id: 'book', title: '특별실 예약', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Book' },
                { id: 'manage', title: '특별실 관리', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Manage' },
            ],
            commands: [{ id: 'ops-room.open-book', title: '특별실 예약 열기', icon: 'list' }, { id: 'ops-room.open-manage', title: '특별실 관리 열기', icon: 'list' }],
            ribbon: [{ commandId: 'ops-room.open-book', icon: 'list', order: 9 }, { commandId: 'ops-room.open-manage', icon: 'list', order: 10 }],
        },
    },
    components: { Book: ({ host }: { host: PluginHost }) => createElement(RoomPanel, { host }), Manage: ({ host }: { host: PluginHost }) => createElement(RoomManagePanel, { host }) },
    commands: {
        'ops-room.open-book': (host: PluginHost) => { host.workspace.open('ops-room.book', { where: 'center' }); },
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
