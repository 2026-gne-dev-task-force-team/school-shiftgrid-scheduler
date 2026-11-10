/**
 * 「시간표」 플러그인 — 시간표(timetable-grid.sheet) 노드 하나 +
 *   그리드 화면 하나(명세 [[시간표 그리드 요구명세]]). ⭐ 선언형 전환(달력·명단과 같은 결):
 *   뷰·명령·리본·노드 타입을 contributes 에 「적고」, 실행 함수·컴포넌트는 이름으로 가리킨다.
 *   🔴 ⛔ 선언 안 되는 것만 onActivate 에 — 노드 다리(modules.use('nodes'))뿐이다.
 *
 *   층: 그리드는 시간표 한 장의 모양(범위·열·행·칸)만 안다 — 학교·달력을 모른다.
 *     달력에 띄우기는 scheduleFor(일정 목록)가 재료를 낸다(달력 약속은 다른 레인 몫 — ⛔ 여기서 안 잇는다).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, CommandContext } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 약속 플러그인에서(값 아님). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import { manifest } from './manifest';
import { GridTab } from './views/GridTab';
import { TimetableProps } from './views/TimetableProps';
import {
    SHEET_TYPE, gridNodeTypes, gridNodeTypeImpl, initGridNodes, getNodesApi, undoRemoved, removedUndoable, duplicateSheet,
} from './nodes';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'timetable-grid.' 를 붙인다). contributes 엔 접두사 없는 'grid' 로 적는다.
const GRID_ID = 'timetable-grid.grid';

export const timetableGridPlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 시간표는 노드다 — nodes 없으면 의미가 없으니 requires. nodeTypes 를 기여하므로 requires.nodes 는 호스트 검사에서도 필수다.
        requires: { nodes: '^0.1' },
        // 🔴 리치 셀 2단계 — 격자는 시트 표(table)를 확장해 그린다 · 칸 글자는 리치 셀(page)이 그린다(없으면 맨 글자).
        supports: { table: '^0.1', 'rich-cell': '^0.1' },
        contributes: {
            // 그리드 화면(싱글턴·가운데·안 가름 — 달력·명단과 같은 placement).
            views: [{
                id: 'grid', title: '시간표', icon: 'schedule', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 320, squeeze: 'scroll' },
                component: 'Grid',
            }],
            commands: [
                { id: 'timetable-grid.open', title: '시간표 열기', icon: 'schedule', keys: 'Mod+Alt+T' },
                { id: 'timetable-grid.openSheet', title: '시간표 열기(탐색기)', icon: 'schedule', palette: false },
                { id: 'timetable-grid.duplicate', title: '표 복사(통째)', icon: 'copy' },
                { id: 'timetable-grid.undoRemoved', title: '삭제한 행·열 되돌리기', icon: 'undo', palette: false },
            ],
            ribbon: [{ commandId: 'timetable-grid.open', icon: 'schedule', order: 4 }],
            nodeTypes: gridNodeTypes,
            // 오른쪽 속성 패널 — 시간표 설정(범위·열·보이는 시각). 화면 위 도구 막대를 대신한다(T3·T4).
            properties: [{ target: SHEET_TYPE, id: 'timetable', title: '시간표', pane: 'TimetableProps' }],
        },
    },

    components: {
        // 그리드 화면 — 보고 있는 시간표(store)를 그린다. host 는 안 쓴다(다리가 쥔다).
        Grid: ({ leaf }) => createElement(GridTab, { leafId: leaf.id }),
    },
    panes: { TimetableProps },
    commands: {
        // 리본 「시간표 열기」 — 보고 있는 시간표는 그대로 두고 화면만 연다(없으면 시작 화면 — 새 시간표·목록).
        'timetable-grid.open': (host: PluginHost) => { host.workspace.open(GRID_ID, { where: 'center' }); },
        // 시간표 우클릭 「열기」 — 대상은 CommandContext.nodeId(open 이 setActive + 화면 열기).
        'timetable-grid.openSheet': (_host: PluginHost, ctx?: CommandContext) => { const id = ctx?.nodeId; if (id) getNodesApi()?.open(id); },
        // 시간표 우클릭 「표 복사」 — 노드를 통째 복제.
        'timetable-grid.duplicate': (_host: PluginHost, ctx?: CommandContext) => { const id = ctx?.nodeId; if (id) duplicateSheet(id); },
        'timetable-grid.undoRemoved': () => { undoRemoved(); },
    },
    enabled: { 'timetable-grid.undoRemoved': () => removedUndoable() },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'sheet' 가 가리킨다(open·menu).
    nodeTypes: gridNodeTypeImpl,

    lifecycle: {
        // 선언 안 되는 것만 — 노드 다리 구독(노드 타입 등록은 contributes.nodeTypes 가 끝냈다).
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            initGridNodes(nodes ?? null, host);
        },
    },
});

export default timetableGridPlugin;
