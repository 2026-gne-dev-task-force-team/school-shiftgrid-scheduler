/**
 * 「일과표」 플러그인 — 일과표(bell.table)·시간 칸(bell.slot) 노드 둘 + 화면 하나 + 약속 clock(순수 셈).
 *   선언형(people 과 같은 결) — onActivate 엔 노드 다리만. clock 모듈은 순수 셈 묶음(clock.ts)이라 kit 를 안 본다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, CommandContext } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { bellNodeTypes, bellNodeTypeImpl, initBell, getKit } from './nodes';
import { clockApi } from './clock';

const SHEET_ID = 'bell.sheet';

export const bellPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { clock: '0.1.0' },
        requires: { nodes: '^0.1', 'collection': '^0.2' },
        supports: { 'page-doc': '^0.1' },
        contributes: {
            interfaces: [{ name: 'clock', version: '0.1.0', label: '일과표 시각 셈', desc: '학년별 교시 시각·점심·겹침을 셉니다' }],
            views: [{
                id: 'sheet', title: '일과표', icon: 'schedule', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Sheet',
            }],
            commands: [
                { id: 'bell.open', title: '일과표 열기', icon: 'schedule' },
                { id: 'bell.openList', title: '일과표 열기', icon: 'schedule', palette: false },
            ],
            ribbon: [{ commandId: 'bell.open', icon: 'schedule', order: 6 }],
            nodeTypes: bellNodeTypes,
        },
    },

    components: {
        Sheet: ({ host, peek, leaf }) => { const k = getKit(); return k ? createElement(k.Tab, { host, peek, leafId: leaf.id }) : null; },
    },
    commands: {
        'bell.open': (host: PluginHost) => { host.workspace.open(SHEET_ID, { where: 'center' }); },
        'bell.openList': (_host: PluginHost, ctx?: CommandContext) => { getKit()?.openList(ctx?.nodeId); },
    },
    nodeTypes: bellNodeTypeImpl,
    modules: { clock: clockApi },

    lifecycle: {
        onActivate(host: PluginHost) { initBell(host); },
    },
});

export default bellPlugin;
