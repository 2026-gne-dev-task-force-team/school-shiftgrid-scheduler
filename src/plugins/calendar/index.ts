/**
 * 「달력」 플러그인 — 구글 캘린더 같은 월 보기 하나(쥔님 2026-11-01:
 *   *"그냥 구글 캘린더 같은 월 보기 캘린더가 필요한거야"* · *"일정 추가 하지마 월그리드만 해"*).
 *   🔴 ⛔ 옛 위크뷰 참고 안 함(쥔님 지시 *"옛 위크뷰 참고 하지마"*).
 *
 * ⭐ 선언형 전환(2026-11-02 D3): 뷰·명령·리본·설정을 매니페스트 contributes 에 「적고」, 실행 함수·컴포넌트는
 *    이름 붙여 내놓는다(components·commands·panes). 짝은 호스트가 맞춘다(옛 host.*.register/add 는 없앴다).
 *    🔴 ⛔ 선언 안 되는 것만 lifecycle.onActivate 에 남는다 — 노드 다리(modules.use)·스토어 초기화·노드 구독,
 *       첫 실행 기본 배치는 lifecycle.onFirstRun. 화면·기능은 전후 같다.
 *
 * 싱글턴·가운데·안 가름 — pane-test 와 같은 placement(딱 한 장만, 가운데만, 못 가른다).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, ViewProps } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 노드 약속(project-explorer/contracts/nodes)에서(값 아님, 구조 검사 ⑱·g). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi } from '../project-explorer/contracts/nodes';
import { manifest } from './manifest';
import { CalendarTab } from './views/CalendarTab';
import { MiniCalendarView } from './views/MiniCalendarView';
import { CalendarSettings } from './settings/CalendarSettings';
import { initOptions, setScope } from './store';
import { calendarModule } from './feed';
import {
    calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi,
    getMenuTarget, setDefaultStore, newEventInStore,
} from './nodes';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'calendar.' 를 붙인다 · 구조 검사가 접두사를 본다).
//    contributes.views 의 id 는 접두사 없는 'month'·'mini' 로 적고, 호스트가 붙인 뒤의 전체 id 를 여기서 연다.
const MONTH_ID = 'calendar.month';
const MINI_ID = 'calendar.mini';

export const calendarPlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 M0 — 일정은 노드다(달력은 저장을 모른다). nodes 인터페이스가 없으면 달력이 의미가 없으니 requires.
        //    nodeTypes(저장소·일정)를 기여하므로 requires.nodes 는 호스트 검사에서도 필수다.
        requires: { nodes: '^0.1' },
        // 🔴 달력은 「calendar」 약속을 채운다 — 다른 플러그인이 남의 일정을 꽂는 입구(modules.calendar).
        provides: { calendar: '0.1.0' },
        // ── 「나는 이 뷰·명령·리본·설정을 낸다」 — 순수 데이터. 함수·컴포넌트는 아래 이름으로 가리킨다 ──
        contributes: {
            // 🔴 calendar 약속을 **들고 온다**(2026-11-08 「플러그인은 꾸러미다」). 달력 꾸러미가 약속·provides·화면을 한 폴더에 묶는다
            //    — 들고 오는 쪽과 채우는 쪽이 같아도 된다(소비자는 남의 일정을 modules.calendar 로 꽂는다).
            interfaces: [{ name: 'calendar', version: '0.1.0', label: '달력', desc: '달력에 넣는 일정' }],
            views: [
                // 월 보기(싱글턴·가운데·안 가름) — 아이콘은 'calendar'(쥔님 *"캘린더 스럽지 않아"* 로 'table' 에서 바꿈).
                {
                    id: 'month', title: '달력', icon: 'calendar', defaultArea: 'center',
                    placement: { areas: ['center'], singleton: true },
                    layout: { minWidth: 280, squeeze: 'scroll' },
                    component: 'Month',
                },
                // 작은 달력(사이드 패널용 · 싱글턴) — 기본 오른쪽(22:51). split 생략=가름 허용(왼쪽 탐색기 아래 세로로).
                {
                    id: 'mini', title: '작은 달력', icon: 'calendarMini', defaultArea: 'right',
                    placement: { areas: ['left', 'right'], singleton: true },
                    layout: { minWidth: 200, squeeze: 'scroll' },
                    component: 'Mini',
                },
            ],
            commands: [
                { id: 'calendar.open', title: '달력 열기', icon: 'calendar' },
                { id: 'calendar.openStore', title: '달력에서 열기', icon: 'calendar' },
                { id: 'calendar.newEventIn', title: '새 일정', icon: 'plus' },
                { id: 'calendar.openMini', title: '작은 달력 열기(오른쪽 패널)', icon: 'calendarMini' },
            ],
            // 리본 아이콘 둘 — 월 보기(calendar·order 1) · 작은 달력(calendarMini·order 2).
            ribbon: [
                { commandId: 'calendar.open', icon: 'calendar', order: 1 },
                { commandId: 'calendar.openMini', icon: 'calendarMini', order: 2 },
            ],
            // 설정 「달력」 판 — 보기 옵션(간트·분기) 토글.
            settings: {
                sections: [{ id: 'calendar', title: '달력', icon: 'calendar' }],
                items: [{ section: 'calendar', id: 'calendar', title: '보기', icon: 'calendar', pane: 'Settings' }],
            },
            // 🔴 노드 타입 둘(저장소·일정) — 선언형 전환 D5. 활성 때 applyContributes 가 노드 레지스트라(탐색기)에 통째로 넘긴다.
            //    함수(open·menu)는 아래 nodeTypes(calendarNodeTypeImpl)에 impl 'store' 로 가리킨다 — 옛 onActivate 의 registerCalendarTypes 를 대체.
            nodeTypes: calendarNodeTypes,
        },
    },

    // ── 이름 붙인 구현 — 호스트가 contributes 의 이름으로 찾아 꽂는다(p.host 로 호스트가 끼워져 온다) ──
    components: {
        // 탭 하나 안에서 월·연·주·3일·하루 전환(CalendarTab). 🔴 일정 카드는 창틀 미리보기(peek)에 — ViewProps.peek 을 내린다.
        Month: (p: ViewProps & { host: PluginHost }) => createElement(CalendarTab, { peek: p.peek }),
        Mini: (_p: ViewProps & { host: PluginHost }) => createElement(MiniCalendarView),
    },
    commands: {
        // 리본 「달력 열기」는 범위를 전체(null)로 — 저장소 하나로 좁혀 보던 걸 풀고 모든 저장소 일정을 본다(쥔님 2026-11-02).
        'calendar.open': (host: PluginHost) => { setScope(null); host.workspace.open(MONTH_ID, { where: 'center' }); },
        // 저장소 우클릭 「달력에서 열기」 — 대상은 nodes.ts 의 「메뉴가 가리킨 저장소」(ContextMenu 는 인자를 안 싣는다).
        'calendar.openStore': () => { const id = getMenuTarget(); if (id) getNodesApi()?.open(id); },
        // 저장소 우클릭 「새 일정」 — 오늘 종일 일정 + 「열 카드」로 담고 월 보기를 연다.
        'calendar.newEventIn': (host: PluginHost) => {
            const id = getMenuTarget();
            if (!id) return;
            setDefaultStore(id);
            if (!newEventInStore(id)) return;                      // 오늘 종일 일정 + 「열 카드」로 담기
            host.workspace.open(MONTH_ID, { where: 'center' });    // 월 보기(마운트/구독 때 카드를 연다)
        },
        // 작은 달력 리본 — 점 찍힌 달력(calendarMini)으로 월 보기와 가른다. 오른쪽 패널에 연다(22:51).
        'calendar.openMini': (host: PluginHost) => { host.workspace.open(MINI_ID, { where: 'right' }); },
    },
    panes: {
        // 설정 「달력」 판 본문 — 기기별 옵션 토글. host 는 안 쓴다(initOptions 가 onActivate 에서 쥐었다).
        Settings: (_p: { host: PluginHost }) => createElement(CalendarSettings),
    },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'store' 가 가리킨다(저장소 open·menu). 일정은 순수 데이터라 없다.
    nodeTypes: calendarNodeTypeImpl,
    // 🔴 calendar 약속을 채우는 모듈 — provides.calendar 와 짝(키 이름이 같아야 tsc 가 통과). 남의 일정 입구.
    modules: { calendar: calendarModule },

    lifecycle: {
        /**
         * 선언 안 되는 것만 — 스토어 초기화·노드 다리 구독(노드 타입 등록은 contributes.nodeTypes 가 끝냈다).
         *   🔴 ⛔ 여기서 탭을 열지 않는다(등록은 contributes 가, 첫 배치는 onFirstRun 이 한다).
         */
        onActivate(host: PluginHost) {
            // 옵션(간트·분기 보기 — 기본 꺼짐)을 기기별 저장소에서 읽어 온다 · 설정 「달력」 판에서 켠다
            initOptions(host);

            // ── 일정 자료 다리를 건다 — 🔴 일정은 노드다. 달력은 저장을 모른다(요구명세).
            //    노드 타입 둘(저장소·일정)은 contributes.nodeTypes 가 applyContributes(= onActivate 보다 먼저)에서 꽂았다.
            //    탐색기가 없거나 꺼졌으면 조용히 빈 상태로 돈다.
            const nodes = host.modules.use<NodesApi>('nodes');
            initCalendarNodes(nodes ?? null);
        },
        /**
         * 첫 실행 기본 배치: 가운데 달력 탭 하나 + 오른쪽 패널에 작은 달력(쥔님 2026-11-01 21:47·2026-11-02 15:52).
         *   🔴 ⛔ 기기별 플래그라 한 번만 — 이미 쓰던 기기는 저장된 워크스페이스가 있어 안 바뀐다(⛔ 저장된 배치를 덮지 않는다).
         */
        onFirstRun(host: PluginHost) {
            host.workspace.open(MONTH_ID, { where: 'center' });
            host.workspace.open(MINI_ID, { where: 'right' });
        },
    },
});

export default calendarPlugin;
