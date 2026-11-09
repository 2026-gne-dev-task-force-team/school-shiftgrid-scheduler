/**
 * 「page-editor」 꾸러미 — 노션식 마크다운 페이지. 페이지 노드 하나(page-editor.page) + 편집 화면 하나.
 *   ⭐ 선언형 전환(달력·그리드와 같은 결): 뷰·명령·리본·노드 타입을 contributes 에 「적고」, 실행은 이름으로 가리킨다.
 *   🔴 ⛔ 선언 안 되는 것만 onActivate 에 — 노드 다리(modules.use('nodes'))뿐이다.
 *   표 블록은 host.modules.use('table') 로 받는다(supports: table — 없으면 읽기 전용으로 버틴다).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 약속 플러그인 contracts 에서(값은 host.modules.use('nodes')).
import type { NodesApi } from '../project-explorer/contracts/nodes';
import { manifest } from './manifest';
import { PageView } from './views/PageView';
import { pageNodeTypes, pageNodeTypeImpl, initPageNodes, getNodesApi, getMenuTarget, PAGE_TYPE } from './nodes';
import { PageProps } from './views/PageProps';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'page-editor.' 를 붙인다). contributes 엔 접두사 없는 'editor' 로.
const EDITOR_ID = 'page-editor.editor';

export const pageEditorPlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 페이지는 노드다 — nodes 없으면 의미가 없으니 requires. 표는 있으면 쓰고 없으면 읽기 전용 → supports.
        requires: { nodes: '^0.1' },
        supports: { table: '^0.1' },
        contributes: {
            views: [{
                id: 'editor', title: '페이지', icon: 'fileText', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 360, squeeze: 'scroll' },
                component: 'Editor',
            }],
            commands: [
                { id: 'page-editor.open', title: '페이지 열기', icon: 'fileText' },
                { id: 'page-editor.openPage', title: '페이지 열기(탐색기)', icon: 'fileText' },
            ],
            ribbon: [{ commandId: 'page-editor.open', icon: 'fileText', order: 7 }],
            nodeTypes: pageNodeTypes,
            // 🔴 속성 칸 — 탐색기에서 페이지를 고르면 제목·아이콘·위치가 뜬다
            properties: [{ target: PAGE_TYPE, id: 'page', title: '페이지', pane: 'PageProps' }],
        },
    },

    panes: { PageProps },
    components: {
        // 편집 화면 — 보고 있는 페이지(store)를 그린다. host 는 표 약속을 받는 데 쓴다.
        Editor: (p) => createElement(PageView, { host: p.host }),
    },
    commands: {
        'page-editor.open': (host: PluginHost) => { host.workspace.open(EDITOR_ID, { where: 'center' }); },
        'page-editor.openPage': () => { const id = getMenuTarget(); if (id) getNodesApi()?.open(id); },
    },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'page' 가 가리킨다(open·menu).
    nodeTypes: pageNodeTypeImpl,

    lifecycle: {
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            initPageNodes(nodes ?? null);
        },
    },
});

export default pageEditorPlugin;
