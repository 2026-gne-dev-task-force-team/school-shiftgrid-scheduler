/**
 * 「캘린더」 플러그인 — 구글 캘린더 같은 월 보기 하나(쥔님 2026-11-01:
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
    // 옵션(간트·분기 보기 — 기본 꺼짐)을 기기별 저장소에서 읽어 온다 · 설정 「캘린더」 판에서 켠다
    initOptions(host);
    host.settings.addSection('calendar', '캘린더', 'calendar');
    host.settings.addItem({ section: 'calendar', id: 'calendar', title: '보기', icon: 'calendar', Pane: () => createElement(CalendarSettings) });

    // ── 뷰: 월 보기(싱글턴·가운데·안 가름) ──
    //    아이콘은 Icon 부품의 'calendar'(16:55 추가 — 처음엔 격자 'table' 이었다. 쥔님 *"캘린더 스럽지 않아"*).
    host.views.register({
        id: 'month', title: '캘린더', icon: 'calendar', defaultArea: 'center',
        placement: { areas: ['center'], split: false, singleton: true },
        layout: { minWidth: 280, squeeze: 'scroll' },
        // 탭 하나 안에서 월·연·주·3일·하루 전환(CalendarTab) — 17:06 넷을 더 받으며 MonthView 직접 → 컨테이너로
        Component: () => createElement(CalendarTab, { openMini: () => host.workspace.open(MINI_ID, { where: 'left' }) }),
    });

    // ── 명령 + 리본 아이콘 하나 — 누르면 월 보기를 연다(싱글턴이라 두 장 안 열린다) ──
    host.commands.add({
        id: 'calendar.open', title: '캘린더 열기', icon: 'calendar',
        run: () => { host.workspace.open(MONTH_ID, { where: 'center' }); },
    });
    host.ribbon.add({ commandId: 'calendar.open', icon: 'calendar', order: 1 });

    // ── 뷰: 미니 캘린더(사이드 패널용 · 싱글턴 · 안 가름) — 가운데엔 못 놓는다(쥔님 *"패널용으로"*) ──
    host.views.register({
        id: 'mini', title: '미니 캘린더', icon: 'calendar', defaultArea: 'left',
        placement: { areas: ['left', 'right'], split: false, singleton: true },
        layout: { minWidth: 200, squeeze: 'scroll' },
        Component: () => createElement(MiniCalendarView),
    });
    // 여는 길은 명령(팔레트)뿐 — 리본에 같은 달력 아이콘을 둘 세우면 헷갈린다. 왼쪽 패널에 연다.
    host.commands.add({
        id: 'calendar.openMini', title: '미니 캘린더 열기(왼쪽 패널)', icon: 'calendar',
        run: () => { host.workspace.open(MINI_ID, { where: 'left' }); },
    });
}

export const calendarPlugin: PluginModule = { manifest, activate };
export default calendarPlugin;
