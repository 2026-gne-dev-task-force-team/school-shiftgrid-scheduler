/**
 * 「page」 꾸러미 — 노션식 마크다운 페이지. 페이지 노드 하나(page.page) + 편집 화면 하나.
 *   ⭐ 선언형 전환(달력·그리드와 같은 결): 뷰·명령·리본·노드 타입을 contributes 에 「적고」, 실행은 이름으로 가리킨다.
 *   🔴 ⛔ 선언 안 되는 것만 onActivate 에 — 노드 다리(modules.use('nodes'))뿐이다.
 *   표 블록은 host.modules.use('table') 로 받는다(supports: table — 없으면 읽기 전용으로 버틴다).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, CommandContext } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 약속 플러그인 contracts 에서(값은 host.modules.use('nodes')).
import type { NodesApi } from '../explorer/contracts/nodes';
import { manifest } from './manifest';
import { PageView } from './views/PageView';
import { pageNodeTypes, pageNodeTypeImpl, initPageNodes, getNodesApi, PAGE_TYPE } from './nodes';
import { PageProps } from './views/PageProps';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'page.' 를 붙인다). contributes 엔 접두사 없는 'editor' 로.
import { PageEditor } from './views/PageView';
import type { PageDocApi } from './contracts/page-doc';
import type { Page } from './core/types';
import { emptyPage } from './core/types';
const EDITOR_ID = 'page.editor';


// 🔴 page-doc 모듈 — 저장은 손님 몫(value/onChange). 모르는 꼴·빈 값이면 빈 문서로 시작한다.
const pageDocApi: PageDocApi = {
    version: 1,
    PageDoc: (p) => createElement(PageEditor, {
        host: p.host, docKey: p.docKey, onRename: p.onRename, properties: p.properties,
        load: () => { const v = p.value as Page | undefined; return v && Array.isArray(v.blocks) && v.blocks.length > 0 ? v : emptyPage(); },
        save: (pg) => p.onChange(pg),
    }),
};

export const pagePlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 페이지는 노드다 — nodes 없으면 의미가 없으니 requires. 표는 있으면 쓰고 없으면 읽기 전용 → supports.
        requires: { nodes: '^0.1' },
        supports: { table: '^0.1' },
        // 🔴 page-doc — 다른 꾸러미가 자기 자료(레코드 줄 등)에 문서를 붙여 쓰는 편집기(모듈 값은 아래 modules['page-doc'])
        provides: { 'page-doc': '0.1.0' },
        contributes: {
            interfaces: [{ name: 'page-doc', version: '0.1.0', label: '페이지 문서', desc: '다른 화면의 줄·항목에 붙여 쓰는 문서 편집기' }],
            views: [{
                id: 'editor', title: '페이지', icon: 'fileText', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 360, squeeze: 'scroll' },
                component: 'Editor',
            }],
            commands: [
                { id: 'page.open', title: '페이지 열기', icon: 'fileText' },
                { id: 'page.openPage', title: '페이지 열기(탐색기)', icon: 'fileText', palette: false },
            ],
            ribbon: [{ commandId: 'page.open', icon: 'fileText', order: 7 }],
            nodeTypes: pageNodeTypes,
            // 🔴 속성 칸 — 탐색기에서 페이지를 고르면 제목·아이콘·위치가 뜬다
            properties: [{ target: PAGE_TYPE, id: 'page', title: '페이지', pane: 'PageProps' }],
        },
    },

    panes: { PageProps },
    components: {
        // 편집 화면 — 보고 있는 페이지(store)를 그린다. host 는 표 약속을 받는 데 쓴다.
        Editor: (p) => createElement(PageView, { host: p.host, leafId: p.leaf?.id }),
    },
    commands: {
        'page.open': (host: PluginHost) => { host.workspace.open(EDITOR_ID, { where: 'center' }); },
        'page.openPage': (_host: PluginHost, ctx?: CommandContext) => { const id = ctx?.nodeId; if (id) getNodesApi()?.open(id); },
    },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'page' 가 가리킨다(open·menu).
    nodeTypes: pageNodeTypeImpl,
    modules: { 'page-doc': pageDocApi },

    lifecycle: {
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            initPageNodes(nodes ?? null);
        },
    },
});

export default pagePlugin;
