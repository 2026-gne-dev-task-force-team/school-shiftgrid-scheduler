/**
 * 스케줄러 플러그인(코어) — 창틀에 꽂는 첫 손님(W13 실증).
 *   뷰(주간 캘린더·카드 상세) · 리본 동작「새 스케줄」 · 설정「스케줄러」 · 상태바「카드 N」 · 탭 메뉴「스케줄 지우기」.
 *
 *   ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다.
 * 🔴 ⛔ 창틀은 이 폴더를 모른다. 바깥으로 나가는 값은 PluginModule 하나뿐이다.
 *
 * 🔴 피크 우회(「호스트에 바라는 것」): workspace.open(where:'peek') 는 reuse·singleton 을 안 먹어 카드마다 피크가 쌓인다.
 *    그래서 ① 선택을 스토어에 두고(CardView 가 읽는다) ② 카드 피크를 "한 장만" 열어 둔다
 *    (열린 카드 피크의 leafId 를 작업대 close 이벤트로 추적해 닫히면 다시 열 수 있게 한다).
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { createScheduleStore } from './store';
import { WeekView } from './views/WeekView';
import { CardView } from './views/CardView';
import { CardCountStatus } from './components/CardCountStatus';
import { SchedulerSettingsPane } from './settings/SchedulerSettingsPane';

function activate(host: PluginHost): void {
    const store = createScheduleStore(host);

    // 🔴 피크 한 장만 — 열린 카드 피크의 leafId
    let cardPeekLeafId: string | null = null;
    const openCard = (cardId: string) => {
        store.select(cardId);
        if (cardPeekLeafId == null) {
            cardPeekLeafId = host.workspace.open('scheduler.card', { where: 'peek', title: '카드', params: {} });
        }
    };
    host.workspace.on('close', (l) => { if (l.id === cardPeekLeafId) cardPeekLeafId = null; });

    // ── 뷰 — 주간 캘린더(center) · 카드 상세(피크) ──
    // ⛔ newTab 을 안 잡는다 — 「+」는 빈 탭(app.blank)이다(쥔님 13:15). 스케줄은 리본 「새 스케줄」로 연다
    host.views.register({
        id: 'week', title: '스케줄', icon: 'table', defaultArea: 'center',
        layout: { minWidth: 480, squeeze: 'scroll' },
        Component: (p) => createElement(WeekView, { ...p, store, onCardClick: openCard }),
    });
    host.views.register({
        id: 'card', title: '카드', icon: 'info', defaultArea: 'right',
        singleton: true, layout: { minWidth: 220 },
        Component: (p) => createElement(CardView, { ...p, store }),
    });

    // ── 명령 + 리본 동작「새 스케줄」(동작이지 뷰가 아니다) ──
    host.commands.add({
        id: 'scheduler.new', title: '새 스케줄', icon: 'table',
        run: () => { host.workspace.open('scheduler.week', { where: 'center' }); },
    });
    host.ribbon.add({ commandId: 'scheduler.new', icon: 'table', order: 0 });

    // ── 설정「스케줄러」 — 눈금 기본값 ──
    host.settings.addSection('scheduler', '스케줄러', 'table');
    host.settings.addItem({
        section: 'scheduler', id: 'grid', title: '눈금·시작 시각', icon: 'table',
        Pane: () => createElement(SchedulerSettingsPane, { host, store }),
    });

    // ── 상태바「카드 N」 — 컴포넌트라 스토어를 스스로 구독해 다시 그린다 ──
    host.statusBar.add({ id: 'card-count', side: 'left', render: () => createElement(CardCountStatus, { store }) });

    // ── 탭 메뉴「스케줄 지우기」 — 주간 뷰 탭에만 ──
    host.menu.addTabMenuItem((ctx) => (ctx.viewId === 'scheduler.week'
        ? [{
            label: '스케줄 지우기', icon: 'trash', danger: true,
            onClick: () => { if (window.confirm('스케줄을 빈 상태로 되돌립니다. 되돌릴 수 없습니다.')) store.clear(); },
        }]
        : []));
}

export const schedulerPlugin: PluginModule = { manifest, activate };
export default schedulerPlugin;
