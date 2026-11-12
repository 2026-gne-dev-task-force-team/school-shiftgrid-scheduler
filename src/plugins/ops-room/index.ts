/**
 * 「특별실 예약」 플러그인 — 화면 하나(예약) · 명령 하나(리본). 자료는 book/source 한 창구.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { RoomPanel } from './RoomPanel';

export const opsRoomPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: [
                { id: 'book', title: '특별실 예약', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Book' },
            ],
            commands: [{ id: 'ops-room.open-book', title: '특별실 예약 열기', icon: 'list' }],
            ribbon: [{ commandId: 'ops-room.open-book', icon: 'list', order: 9 }],
        },
    },
    components: { Book: () => createElement(RoomPanel) },
    commands: {
        'ops-room.open-book': (host: PluginHost) => { host.workspace.open('ops-room.book', { where: 'center' }); },
    },
});

export default opsRoomPlugin;
