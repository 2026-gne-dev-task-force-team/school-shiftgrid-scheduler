/**
 * 「사람 명단」 플러그인 — 명단(people.list)·사람(people.person) 노드 둘 + 명단 화면 하나(요구명세 2026-11-08).
 *   ⭐ 선언형 전환(달력과 같은 결): 뷰·명령·리본·노드 타입을 contributes 에 「적고」, 실행 함수·컴포넌트는 이름으로 가리킨다.
 *     🔴 ⛔ 선언 안 되는 것만 onActivate 에 — 노드 다리(modules.use('nodes'))뿐이다.
 *
 *   층(요구명세): ① people(이것) 은 명단과 사람만 안다 — 학교·계정 모름. 위층(school-roster·계정)이 이 약속에 기대어 증축한다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 약속 플러그인에서(값 아님). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi } from '../project-explorer/contracts/nodes';
import { manifest } from './manifest';
import { ListTab } from './views/ListTab';
import { peopleNodeTypes, peopleNodeTypeImpl, initPeopleNodes, getNodesApi, getMenuTarget } from './nodes';
import { peopleApi } from './api';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'people.' 를 붙인다). contributes 엔 접두사 없는 'sheet' 로 적는다.
const SHEET_ID = 'people.sheet';

export const peoplePlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 people 인터페이스를 채운다(provides) — 모듈 값은 아래 modules.people(짝). 학교 명부·계정이 이걸 읽는다.
        provides: { people: '0.1.0' },
        // 🔴 명단·사람은 노드다 — nodes 없으면 의미가 없으니 requires. nodeTypes 를 기여하므로 requires.nodes 는 호스트 검사에서도 필수다.
        requires: { nodes: '^0.1' },
        contributes: {
            // 🔴 people 약속을 **들고 온다**(2026-11-08 「플러그인은 꾸러미다」). 사람 명단 꾸러미가 약속·provides·화면을 한 폴더에.
            interfaces: [{ name: 'people', version: '0.1.0', label: '사람 명단', desc: '이름을 담는 명단' }],
            // 명단 화면(싱글턴·가운데·안 가름 — 달력 월 보기와 같은 placement).
            views: [{
                id: 'sheet', title: '사람 명단', icon: 'users', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Sheet',
            }],
            commands: [
                { id: 'people.open', title: '사람 명단 열기', icon: 'users' },
                { id: 'people.openList', title: '명단 열기', icon: 'users' },
            ],
            ribbon: [{ commandId: 'people.open', icon: 'users', order: 3 }],
            // 🔴 노드 타입 둘(명단·사람) — 활성 때 applyContributes 가 노드 레지스트라(탐색기)에 통째로 넘긴다.
            nodeTypes: peopleNodeTypes,
        },
    },

    components: {
        // 명단 화면 — 보고 있는 명단(store)의 사람들을 표 자리로 그린다. host 는 안 쓴다(다리가 쥔다).
        Sheet: () => createElement(ListTab),
    },
    commands: {
        // 리본 「사람 명단 열기」 — 보고 있는 명단은 그대로 두고 화면만 연다(없으면 안내가 뜬다).
        'people.open': (host: PluginHost) => { host.workspace.open(SHEET_ID, { where: 'center' }); },
        // 명단 우클릭 「명단 열기」 — 대상은 nodes.ts 의 「메뉴가 가리킨 명단」(open 이 setActiveList + 화면 열기).
        'people.openList': () => { const id = getMenuTarget(); if (id) getNodesApi()?.open(id); },
    },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'list' 가 가리킨다(명단 open·menu). 사람은 순수 데이터라 없다.
    nodeTypes: peopleNodeTypeImpl,
    // 🔴 people 인터페이스를 채우는 모듈(provides 와 짝). host.modules.use<People>('people') 가 이걸 받는다.
    modules: { people: peopleApi },

    lifecycle: {
        /**
         * 선언 안 되는 것만 — 노드 다리 구독(노드 타입 등록은 contributes.nodeTypes 가 끝냈다).
         *   🔴 ⛔ 여기서 화면을 열지 않는다 · 명단을 자동 생성하지 않는다(쥔님이 탐색기에서 만든다).
         */
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            initPeopleNodes(nodes ?? null);
        },
    },
});

export default peoplePlugin;
