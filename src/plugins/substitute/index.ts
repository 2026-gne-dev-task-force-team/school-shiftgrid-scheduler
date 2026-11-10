/**
 * 「보결 명단」 플러그인 — 보결 명단(substitute.list)·교직원(substitute.staff) 노드 둘 + 명단 화면 하나(쥔님 2026-11-10).
 *   선언형(rooms·people 과 같은 결) — onActivate 엔 노드 다리만.
 *   ⛔ 약속(provides)은 아직 없다 — 이 명단을 읽을 기능(후보 등급)이 이 꾸러미 안에 들어올 때 그때 정한다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, CommandContext } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { substituteNodeTypes, substituteNodeTypeImpl, initSubstitute, getKit } from './nodes';

const SHEET_ID = 'substitute.sheet';

export const substitutePlugin = definePlugin({
    manifest: {
        ...manifest,
        requires: { nodes: '^0.1', 'collection': '^0.2' },
        supports: { 'page-doc': '^0.1' },
        contributes: {
            views: [{
                id: 'sheet', title: '보결 명단', icon: 'users', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Sheet',
            }],
            commands: [
                { id: 'substitute.open', title: '보결 명단 열기', icon: 'users' },
                { id: 'substitute.openList', title: '명단 열기', icon: 'users', palette: false },
            ],
            ribbon: [{ commandId: 'substitute.open', icon: 'users', order: 5 }],
            nodeTypes: substituteNodeTypes,
        },
    },

    components: {
        Sheet: ({ host, peek, leaf }) => { const k = getKit(); return k ? createElement(k.Tab, { host, peek, leafId: leaf.id }) : null; },
    },
    commands: {
        'substitute.open': (host: PluginHost) => { host.workspace.open(SHEET_ID, { where: 'center' }); },
        'substitute.openList': (_host: PluginHost, ctx?: CommandContext) => { getKit()?.openList(ctx?.nodeId); },
    },
    nodeTypes: substituteNodeTypeImpl,

    lifecycle: {
        onActivate(host: PluginHost) { initSubstitute(host); },
    },
});

export default substitutePlugin;
