/**
 * 「record-view」 꾸러미 — 공통 목록 화면 부품(레코드 뷰)을 담은 한 플러그인. ⭐ P1: 탐색기에서 「새로 만들기 ▸ 레코드 뷰」로 빈 레코드 뷰(노드)를 만들어 칸·행을 직접 만든다.
 *   🔴 부품(RecordView·Cell·Toolbar·Popover) + 순수 로직(필터·정렬·검색) + 보기 상태 + 알약 색 + 연습장 뷰가
 *     모두 이 폴더 안에 산다(2026-11-08 「플러그인은 꾸러미다」). pane-ui-system(창틀 엔진)은 도메인 없는
 *     자리라 목록 화면 부품은 거기 안 산다 — 이 꾸러미로 내려왔다.
 *   약속(record-view 타입)은 contracts/record-view.ts 에 있고, 매니페스트 contributes.interfaces 로 들고 온다.
 *   제공(provides: record-view · 모듈 값 recordViewApi)으로 채운다 — 손님은 host.modules.use<RecordViewApi>('record-view').
 *   ⭐ 「레코드 뷰 연습장」 뷰 하나를 낸다 — 손님 배선 전에도 이 화면 하나로 무엇이 되는지 눈으로 본다(쥔님이 직접 만져 보는 자리).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 약속 플러그인의 contracts 에서(값 아님). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi } from '../project-explorer/contracts/nodes';
import { manifest } from './manifest';
import { recordViewApi } from './api';
import { PlaygroundView } from './views/PlaygroundView';
import { DbView } from './views/DbView';
import { recordNodeTypes, recordNodeTypeImpl, initRecordNodes, getMenuTarget, restoreTrashedRows } from './nodes';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'record-view.' 를 붙인다). contributes 엔 접두사 없는 'playground' 로.
const PLAYGROUND_ID = 'record-view.playground';

export const recordViewPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { 'record-view': '0.2.0' },
        // 🔴 레코드 뷰도 노드다 — nodeTypes 를 기여하므로 requires.nodes 는 호스트 검사에서도 필수다.
        requires: { nodes: '^0.1' },
        contributes: {
            // 🔴 record-view 약속을 들고 온다(꾸러미 매니페스트) — 켜진 record-view 가 호스트 약속 목록에 record-view 를 올린다.
            interfaces: [{ name: 'record-view', version: '0.2.0', label: '목록 화면', desc: '목록을 보고 고치는 공통 화면' }],
            // 레코드 뷰 연습장 — 가운데 싱글턴(한 장만). 손님과 무관한 「만져 보는」 화면.
            views: [{
                id: 'playground', title: '레코드 뷰 연습장', icon: 'table', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 300, squeeze: 'scroll' },
                component: 'Playground',
            }, {
                // 레코드 뷰 노드 화면 — 가운데 싱글턴(한 장만). 보고 있는 레코드 뷰 노드를 그린다.
                id: 'db', title: '레코드 뷰', icon: 'table', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 320, squeeze: 'scroll' },
                component: 'Db',
            }],
            commands: [
                { id: 'record-view.openPlayground', title: '레코드 뷰 연습장 열기', icon: 'table' },
                { id: 'record-view.restoreTrashed', title: '휴지통의 행 복원', icon: 'undo' },
            ],
            ribbon: [{ commandId: 'record-view.openPlayground', icon: 'table', order: 20 }],
            // 🔴 노드 타입 둘(레코드 뷰·행) — 활성 때 applyContributes 가 노드 레지스트라(탐색기)에 통째로 넘긴다.
            nodeTypes: recordNodeTypes,
        },
    },

    components: {
        // 연습장 화면 — 자기 자료(연습용)를 들고 RecordView 를 그린다. host 는 안 쓴다.
        Playground: () => createElement(PlaygroundView),
        // 레코드 뷰 노드 화면 — host 로 탐색기 되돌리기 명령을 부른다.
        Db: DbView,
    },
    commands: {
        'record-view.openPlayground': (host: PluginHost) => { host.workspace.open(PLAYGROUND_ID, { where: 'center' }); },
        // 탐색기 우클릭 「휴지통의 행 N개 복원」 — 메뉴가 가리킨 레코드 뷰의 휴지통 행을 되살린다.
        'record-view.restoreTrashed': () => { const id = getMenuTarget(); if (id) restoreTrashedRows(id); },
    },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'db' 가 가리킨다(열기·새로 만들기 초기값·메뉴).
    nodeTypes: recordNodeTypeImpl,
    // 🔴 record-view 인터페이스를 채우는 모듈(provides 와 짝). host.modules.use<RecordViewApi>('record-view') 가 이걸 받는다.
    modules: { 'record-view': recordViewApi },

    lifecycle: {
        // 선언 안 되는 것만 — 노드 다리 구독(노드 타입 등록은 contributes.nodeTypes 가 끝냈다).
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            initRecordNodes(nodes ?? null);
        },
    },
});
export default recordViewPlugin;
