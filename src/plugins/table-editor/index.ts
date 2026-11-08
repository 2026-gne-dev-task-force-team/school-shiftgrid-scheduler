/**
 * 「table-editor」 꾸러미 — table 약속을 **들고 와**(contributes.interfaces) 채운다(provides: table · 모듈 값은 tableApi).
 *   손님(roster·시간표 그리드)이 host.modules 로 table 모듈을 받아 Table 을 쓴다.
 *   🔴 약속·제공·엔진·기능 모듈을 한 폴더(이 꾸러미)에 묶는다(2026-11-08 「플러그인은 꾸러미다」).
 *
 *   ⭐ v3(2026-11-08): 「표 연습장」을 걷고 **표 노드**로 바꿨다 — 탐색기에서 「새로 만들기 ▸ 표」로 만들고 열면
 *      노션식 표 화면(TableNodeView)이 뜬다. 내용은 그 노드에 저장돼 다시 열어도 남는다(requires: nodes).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 약속 플러그인의 contracts 에서(값 아님). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi } from '../project-explorer/contracts/nodes';
import { manifest } from './manifest';
import { tableApi } from './api';
import { TableNodeView } from './views/TableNodeView';
import { tableNodeTypes, tableNodeTypeImpl, initTableNodes } from './nodes';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'table-editor.' 를 붙인다). contributes 엔 접두사 없는 'sheet' 로.
const SHEET_ID = 'table-editor.sheet';

export const tableEditorPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { table: '0.1.0' },
        // 🔴 표도 노드다 — nodeTypes 를 기여하므로 requires.nodes 는 호스트 검사에서도 필수다.
        requires: { nodes: '^0.1' },
        contributes: {
            // 🔴 table 약속을 들고 온다(꾸러미 매니페스트) — 켜진 table-editor 가 호스트 약속 목록에 table 을 올린다.
            interfaces: [{ name: 'table', version: '0.1.0', label: '표', desc: '값을 담는 표' }],
            // 표 노드 화면 — 가운데 싱글턴(한 장만). 보고 있는 표 노드를 그린다.
            views: [{
                id: 'sheet', title: '표', icon: 'table', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 320, squeeze: 'scroll' },
                component: 'Sheet',
            }],
            commands: [{ id: 'table-editor.open', title: '표 열기', icon: 'table' }],
            ribbon: [{ commandId: 'table-editor.open', icon: 'table', order: 6 }],
            // 🔴 노드 타입 하나(표) — 활성 때 applyContributes 가 노드 레지스트라(탐색기)에 통째로 넘긴다.
            nodeTypes: tableNodeTypes,
        },
    },

    components: {
        // 표 화면 — 보고 있는 표 노드(store)를 그린다. host 는 안 쓴다(다리가 쥔다).
        Sheet: () => createElement(TableNodeView),
    },
    commands: {
        // 리본 「표 열기」 — 보고 있는 표는 그대로 두고 화면만 연다(없으면 안내가 뜬다).
        'table-editor.open': (host: PluginHost) => { host.workspace.open(SHEET_ID, { where: 'center' }); },
    },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'table' 이 가리킨다(표 open·createInit).
    nodeTypes: tableNodeTypeImpl,
    // 🔴 table 인터페이스를 채우는 모듈(provides 와 짝). host.modules.use<TableApi>('table') 가 이걸 받는다.
    modules: { table: tableApi },

    lifecycle: {
        // 선언 안 되는 것만 — 노드 다리 구독(노드 타입 등록은 contributes.nodeTypes 가 끝냈다).
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            initTableNodes(nodes ?? null);
        },
    },
});
export default tableEditorPlugin;
