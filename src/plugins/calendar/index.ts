/**
 * 「달력」 플러그인 — 구글 캘린더 같은 월 보기 하나(쥔님 2026-11-01:
 *   *"그냥 구글 캘린더 같은 월 보기 캘린더가 필요한거야"* · *"일정 추가 하지마 월그리드만 해"*).
 *   🔴 ⛔ 옛 위크뷰 참고 안 함(쥔님 지시 *"옛 위크뷰 참고 하지마"*).
 * 🔴 ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다(리본 아이콘을 눌러야 열린다).
 *
 * 싱글턴·가운데·안 가름 — pane-test 와 같은 placement(딱 한 장만, 가운데만, 못 가른다).
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { CalendarTab } from './views/CalendarTab';
import { MiniCalendarView } from './views/MiniCalendarView';
import { CalendarSettings } from './settings/CalendarSettings';
import { initOptions } from './store';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'calendar.' 를 붙인다 · 구조 검사가 접두사를 본다).
const MONTH_ID = 'calendar.month';
const MINI_ID = 'calendar.mini';

function activate(host: PluginHost): void {
    // 옵션(간트·분기 보기 — 기본 꺼짐)을 기기별 저장소에서 읽어 온다 · 설정 「달력」 판에서 켠다
    initOptions(host);
    host.settings.addSection('calendar', '달력', 'calendar');
    host.settings.addItem({ section: 'calendar', id: 'calendar', title: '보기', icon: 'calendar', Pane: () => createElement(CalendarSettings) });

    // ── 뷰: 월 보기(싱글턴·가운데·안 가름) ──
    //    아이콘은 Icon 부품의 'calendar'(16:55 추가 — 처음엔 격자 'table' 이었다. 쥔님 *"캘린더 스럽지 않아"*).
    host.views.register({
        id: 'month', title: '달력', icon: 'calendar', defaultArea: 'center',
        placement: { areas: ['center'], split: false, singleton: true },
        layout: { minWidth: 280, squeeze: 'scroll' },
        // 탭 하나 안에서 월·연·주·3일·하루 전환(CalendarTab) — 17:06 넷을 더 받으며 MonthView 직접 → 컨테이너로
        Component: () => createElement(CalendarTab, { openMini: () => host.workspace.open(MINI_ID, { where: 'right' }) }),
    });

    // ── 명령 + 리본 아이콘 하나 — 누르면 월 보기를 연다(싱글턴이라 두 장 안 열린다) ──
    host.commands.add({
        id: 'calendar.open', title: '달력 열기', icon: 'calendar',
        run: () => { host.workspace.open(MONTH_ID, { where: 'center' }); },
    });
    host.ribbon.add({ commandId: 'calendar.open', icon: 'calendar', order: 1 });

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
