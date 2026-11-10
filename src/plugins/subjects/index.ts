/**
 * 「과목」 플러그인 — 과목 목록(subjects.list)·과목(subjects.subject) 노드 둘 + 과목 화면 하나. people 과 같은 꼴.
 *   🔴 ⛔ 선언 안 되는 것만 onActivate 에 — 노드 다리(modules.use)뿐이다. 시수 계산 같은 기능은 ⛔ 안 만든다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, CommandContext } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { subjectsNodeTypes, subjectsNodeTypeImpl, initSubjects, getKit } from './nodes';
import { subjectsApi } from './api';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'subjects.' 를 붙인다). contributes 엔 접두사 없는 'sheet'.
const SHEET_ID = 'subjects.sheet';

export const subjectsPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { subjects: '0.1.0' },
        requires: { nodes: '^0.1', 'collection': '^0.2' },
        supports: { 'page-doc': '^0.1' },
        contributes: {
            interfaces: [{ name: 'subjects', version: '0.1.0', label: '과목', desc: '과목 목록' }],
            views: [{
                id: 'sheet', title: '과목', icon: 'book', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Sheet',
            }],
            commands: [
                { id: 'subjects.open', title: '과목 열기', icon: 'book' },
                { id: 'subjects.openList', title: '과목 목록 열기', icon: 'book', palette: false },
            ],
            ribbon: [{ commandId: 'subjects.open', icon: 'book', order: 8 }],
            nodeTypes: subjectsNodeTypes,
        },
    },

    components: {
        Sheet: ({ host, peek, leaf }) => { const k = getKit(); return k ? createElement(k.Tab, { host, peek, leafId: leaf.id }) : null; },
    },
    commands: {
        'subjects.open': (host: PluginHost) => { host.workspace.open(SHEET_ID, { where: 'center' }); },
        'subjects.openList': (_host: PluginHost, ctx?: CommandContext) => { getKit()?.openList(ctx?.nodeId); },
    },
    nodeTypes: subjectsNodeTypeImpl,
    modules: { subjects: subjectsApi },

    lifecycle: {
        onActivate(host: PluginHost) { initSubjects(host); },
    },
});

export default subjectsPlugin;
