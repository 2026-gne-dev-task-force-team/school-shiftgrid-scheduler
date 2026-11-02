/**
 * 「달력」 플러그인 — 구글 캘린더 같은 월 보기 하나(쥔님 2026-11-01:
 *   *"그냥 구글 캘린더 같은 월 보기 캘린더가 필요한거야"* · *"일정 추가 하지마 월그리드만 해"*).
 *   🔴 ⛔ 옛 위크뷰 참고 안 함(쥔님 지시 *"옛 위크뷰 참고 하지마"*).
 * 🔴 ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다(리본 아이콘을 눌러야 열린다).
 *
 * 싱글턴·가운데·안 가름 — pane-test 와 같은 placement(딱 한 장만, 가운데만, 못 가른다).
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost, ViewProps } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 노드 시스템 「값」은 host.plugins.get 으로 받는다(구조 검사 ⑨)
import type { NodesApi } from '../project-explorer/api';
import { manifest } from './manifest';
import { CalendarTab } from './views/CalendarTab';
import { MiniCalendarView } from './views/MiniCalendarView';
import { CalendarSettings } from './settings/CalendarSettings';
import { initOptions, setScope } from './store';
import {
    registerCalendarTypes, initCalendarNodes, getNodesApi,
    getMenuTarget, setDefaultStore, newEventInStore,
} from './nodes';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'calendar.' 를 붙인다 · 구조 검사가 접두사를 본다).
const MONTH_ID = 'calendar.month';
const MINI_ID = 'calendar.mini';

function activate(host: PluginHost): void {
    // 옵션(간트·분기 보기 — 기본 꺼짐)을 기기별 저장소에서 읽어 온다 · 설정 「달력」 판에서 켠다
    initOptions(host);

    // ── 노드 시스템에 타입 둘을 꽂고(저장소·일정) 일정 자료 다리를 건다 ──
    //    🔴 일정은 노드다 — 달력은 저장을 모른다(요구명세). 탐색기가 없거나 꺼졌으면 조용히 빈 상태로 돈다.
    const nodes = host.plugins.get<NodesApi>('project-explorer');
    if (nodes) {
        // 저장소를 열면(탐색기 한 번 누르기·「달력에서 열기」) 달력 월 보기를 가운데에 연다(싱글턴). 그 저장소가 「기본 저장소」가 되고(nodes.ts),
        //   범위(scope)도 그 저장소로 좁힌다 — 그 저장소와 그 자손 저장소 일정만 보인다(쥔님 2026-11-02).
        registerCalendarTypes(nodes, (id) => { setScope(id); host.workspace.open(MONTH_ID, { where: 'center' }); });
    }
    initCalendarNodes(nodes ?? null);
    host.settings.addSection('calendar', '달력', 'calendar');
    host.settings.addItem({ section: 'calendar', id: 'calendar', title: '보기', icon: 'calendar', Pane: () => createElement(CalendarSettings) });

    // ── 뷰: 월 보기(싱글턴·가운데·안 가름) ──
    //    아이콘은 Icon 부품의 'calendar'(16:55 추가 — 처음엔 격자 'table' 이었다. 쥔님 *"캘린더 스럽지 않아"*).
    host.views.register({
        id: 'month', title: '달력', icon: 'calendar', defaultArea: 'center',
        placement: { areas: ['center'], split: false, singleton: true },
        layout: { minWidth: 280, squeeze: 'scroll' },
        // 탭 하나 안에서 월·연·주·3일·하루 전환(CalendarTab) — 17:06 넷을 더 받으며 MonthView 직접 → 컨테이너로
        //   🔴 일정 카드는 창틀의 미리보기(peek)에 띄운다 — ViewProps.peek 을 CalendarTab 에 내린다(설정 선례와 같은 꼴).
        Component: (p: ViewProps) => createElement(CalendarTab, { peek: p.peek }),
    });

    // ── 명령 + 리본 아이콘 하나 — 누르면 월 보기를 연다(싱글턴이라 두 장 안 열린다) ──
    host.commands.add({
        id: 'calendar.open', title: '달력 열기', icon: 'calendar',
        // 리본 「달력 열기」는 범위를 전체(null)로 — 저장소 하나로 좁혀 보던 걸 풀고 모든 저장소 일정을 본다(쥔님 2026-11-02).
        run: () => { setScope(null); host.workspace.open(MONTH_ID, { where: 'center' }); },
    });
    host.ribbon.add({ commandId: 'calendar.open', icon: 'calendar', order: 1 });

    // ── 저장소 우클릭 메뉴가 부르는 명령 둘 — 대상은 nodes.ts 의 「메뉴가 가리킨 저장소」(storeMenu 가 그릴 때 잡아 둔다) ──
    //    🔴 ContextMenu 는 commandId 만 넘기니(인자 없음) 탐색기 명령이 「고른 노드」를 쓰듯 여기선 getMenuTarget() 을 쓴다.
    host.commands.add({
        id: 'calendar.openStore', title: '달력에서 열기', icon: 'calendar',
        run: () => { const id = getMenuTarget(); if (id) getNodesApi()?.open(id); },   // open → 저장소 타입 open(기본 지정 + 월 보기)
    });
    host.commands.add({
        id: 'calendar.newEventIn', title: '새 일정', icon: 'plus',
        run: () => {
            const id = getMenuTarget();
            if (!id) return;
            setDefaultStore(id);
            if (!newEventInStore(id)) return;                                          // 오늘 종일 일정 + 「열 카드」로 담기
            host.workspace.open(MONTH_ID, { where: 'center' });                        // 월 보기(마운트/구독 때 카드를 연다)
        },
    });

    // ── 뷰: 작은 달력(사이드 패널용 · 싱글턴) — 가운데엔 못 놓는다(쥔님 *"패널용으로"*) · 기본은 오른쪽(쥔님 22:51 *"작은 달력은 기본적으로 오른쪽 패널"*) ──
    //    🔴 split 을 명시하지 않는다(생략=가름 허용, 22:51 뒤집음) — 왼쪽 패널에서 탐색기 아래에 세로로 끼울 수 있어야 한다.
    host.views.register({
        id: 'mini', title: '작은 달력', icon: 'calendarMini', defaultArea: 'right',
        placement: { areas: ['left', 'right'], singleton: true },
        layout: { minWidth: 200, squeeze: 'scroll' },
        Component: () => createElement(MiniCalendarView),
    });
    // 리본에도 선다(쥔님 2026-11-01 18:58 *"미니 캘린더 띄우기 앱 리본 따로 있어야 할 것 같은데"*) — 점 찍힌 달력(calendarMini)으로 월 보기와 가른다. 오른쪽 패널에 연다(22:51).
    host.commands.add({
        id: 'calendar.openMini', title: '작은 달력 열기(오른쪽 패널)', icon: 'calendarMini',
        run: () => { host.workspace.open(MINI_ID, { where: 'right' }); },
    });
    host.ribbon.add({ commandId: 'calendar.openMini', icon: 'calendarMini', order: 2 });

    // ── 첫 실행 기본 배치: 오른쪽 패널에 작은 달력 한 번(쥔님 2026-11-01 21:47 *"오른쪽 패널에 기본적으로 작은 달력 띄워주자"*) ──
    //    🔴 ⛔ activate 에서가 아니라 onFirstRun 에서(탐색기가 왼쪽을 여는 것과 같은 꼴). 기기별 플래그라 한 번만 — 이미 쓰던 기기는
    //       저장된 워크스페이스가 있어 안 바뀐다(그게 맞는 동작 · ⛔ 저장된 배치를 덮지 않는다). calendar.mini 는 'right' 를 받는다(placement.areas).
    host.onFirstRun(() => { host.workspace.open(MINI_ID, { where: 'right' }); });
}

export const calendarPlugin: PluginModule = { manifest, activate };
export default calendarPlugin;
