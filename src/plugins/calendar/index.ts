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
import { MonthView } from './views/MonthView';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'calendar.' 를 붙인다 · 구조 검사가 접두사를 본다).
const MONTH_ID = 'calendar.month';

function activate(host: PluginHost): void {
    // ── 뷰: 월 보기(싱글턴·가운데·안 가름) ──
    //    달력 전용 아이콘이 Icon 부품에 없어 격자꼴 'table' 을 쓴다(pane-test 가 'sparkles' 를 쓰는 것과 같은 길).
    host.views.register({
        id: 'month', title: '캘린더', icon: 'table', defaultArea: 'center',
        placement: { areas: ['center'], split: false, singleton: true },
        layout: { minWidth: 280, squeeze: 'scroll' },
        Component: () => createElement(MonthView),
    });

    // ── 명령 + 리본 아이콘 하나 — 누르면 월 보기를 연다(싱글턴이라 두 장 안 열린다) ──
    host.commands.add({
        id: 'calendar.open', title: '캘린더 열기', icon: 'table',
        run: () => { host.workspace.open(MONTH_ID, { where: 'center' }); },
    });
    host.ribbon.add({ commandId: 'calendar.open', icon: 'table', order: 1 });
}

export const calendarPlugin: PluginModule = { manifest, activate };
export default calendarPlugin;
