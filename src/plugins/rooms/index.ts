/**
 * 「방 목록」 플러그인 — 방 목록(rooms.list)·방(rooms.room) 노드 둘 + 방 목록 화면 하나(요구명세 2026-11-08).
 *   ⭐ 선언형 전환(달력·people 과 같은 결): 뷰·명령·리본·노드 타입을 contributes 에 「적고」, 실행 함수·컴포넌트는 이름으로 가리킨다.
 *     🔴 ⛔ 선언 안 되는 것만 onActivate 에 — 노드 다리(modules.use('nodes'))뿐이다.
 *
 *   층(요구명세): ① rooms(이것) 은 목록과 방만 안다 — 학교·예약·계정 모름. 위층(예약·학교 명부)이 이 약속에 기대어 증축한다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 약속 플러그인에서(값 아님). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi } from '../project-explorer/contracts/nodes';
import { manifest } from './manifest';
import { ListTab } from './views/ListTab';
import { roomsNodeTypes, roomsNodeTypeImpl, initRoomsNodes, getNodesApi, getMenuTarget, ROOM_TYPE } from './nodes';
import { roomsApi } from './api';
import { RoomProps } from './views/RoomProps';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'rooms.' 를 붙인다). contributes 엔 접두사 없는 'sheet' 로 적는다.
const SHEET_ID = 'rooms.sheet';

export const roomsPlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 rooms 인터페이스를 채운다(provides) — 모듈 값은 아래 modules.rooms(짝). 예약·학교 명부가 이걸 읽는다.
        provides: { rooms: '0.1.0' },
        // 🔴 목록·방은 노드다 — nodes 없으면 의미가 없으니 requires. nodeTypes 를 기여하므로 requires.nodes 는 호스트 검사에서도 필수다.
        requires: { nodes: '^0.1' },
        // 표 편집기가 있으면 그 표로 그린다(없으면 간이 표) — 있으면 쓰는 것이라 supports
        supports: { table: '^0.1' },
        contributes: {
            // 🔴 rooms 약속을 **들고 온다**(2026-11-08 「플러그인은 꾸러미다」). 방 목록 꾸러미가 약속·provides·화면을 한 폴더에.
            interfaces: [{ name: 'rooms', version: '0.1.0', label: '방 목록', desc: '방·공간을 담는 목록' }],
            // 방 목록 화면(싱글턴·가운데·안 가름 — 달력 월 보기와 같은 placement).
            views: [{
                id: 'sheet', title: '방 목록', icon: 'door', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Sheet',
            }],
            commands: [
                { id: 'rooms.open', title: '방 목록 열기', icon: 'door' },
                { id: 'rooms.openList', title: '목록 열기', icon: 'door' },
            ],
            ribbon: [{ commandId: 'rooms.open', icon: 'door', order: 4 }],
            // 🔴 노드 타입 둘(목록·방) — 활성 때 applyContributes 가 노드 레지스트라(탐색기)에 통째로 넘긴다.
            nodeTypes: roomsNodeTypes,
            // 🔴 속성 칸 — 탐색기에서 방을 고르면 오른쪽 「속성」 패널에 이름·메모가 뜬다.
            properties: [{ target: ROOM_TYPE, id: 'basic', title: '방', pane: 'RoomProps' }],
        },
    },

    panes: { RoomProps },
    components: {
        // 방 목록 화면 — 보고 있는 목록(store)의 방들을 표 자리로 그린다. host 는 안 쓴다(다리가 쥔다).
        Sheet: ({ host }) => createElement(ListTab, { host }),
    },
    commands: {
        // 리본 「방 목록 열기」 — 보고 있는 목록은 그대로 두고 화면만 연다(없으면 안내가 뜬다).
        'rooms.open': (host: PluginHost) => { host.workspace.open(SHEET_ID, { where: 'center' }); },
        // 목록 우클릭 「목록 열기」 — 대상은 nodes.ts 의 「메뉴가 가리킨 목록」(open 이 setActiveList + 화면 열기).
        'rooms.openList': () => { const id = getMenuTarget(); if (id) getNodesApi()?.open(id); },
    },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'list' 가 가리킨다(목록 open·menu). 방은 순수 데이터라 없다.
    nodeTypes: roomsNodeTypeImpl,
    // 🔴 rooms 인터페이스를 채우는 모듈(provides 와 짝). host.modules.use<Rooms>('rooms') 가 이걸 받는다.
    modules: { rooms: roomsApi },

    lifecycle: {
        /**
         * 선언 안 되는 것만 — 노드 다리 구독(노드 타입 등록은 contributes.nodeTypes 가 끝냈다).
         *   🔴 ⛔ 여기서 화면을 열지 않는다 · 목록을 자동 생성하지 않는다(쥔님이 탐색기에서 만든다).
         */
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            initRoomsNodes(nodes ?? null);
        },
    },
});

export default roomsPlugin;
