/**
 * 스케줄러 플러그인(코어) — 창틀에 꽂는 첫 손님(W13 실증).
 *   뷰(주간 캘린더·카드 상세) · 리본 동작「새 스케줄」 · 설정「스케줄러」 · 상태바「카드 N」 · 탭 메뉴「스케줄 지우기」.
 *
 *   ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다.
 * 🔴 ⛔ 창틀은 이 폴더를 모른다. 바깥으로 나가는 값은 PluginModule 하나뿐이다.
 *
 * 🔴 카드 상세는 가운데 탭으로 연다 — 카드 뷰는 singleton 이라 몇 번을 눌러도 「한 장만」 선다.
 *    어느 카드를 보여줄지는 스토어의 selectedCardId 로 바뀐다(CardView 가 읽는다).
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { createScheduleStore } from './store';
import { WeekView } from './views/WeekView';
import { CardView } from './views/CardView';
import { CardCountStatus } from './components/CardCountStatus';

function activate(host: PluginHost): void {
    const store = createScheduleStore(host);

    // 🔴 카드를 누르면 선택을 바꾸고 상세 뷰를 가운데 탭으로 연다 — singleton 이라 한 장만 선다(또 눌러도 그 탭 활성).
    const openCard = (cardId: string) => {
        store.select(cardId);
        host.workspace.open('scheduler.card', { where: 'center', title: '카드' });
    };

    // ── 뷰 — 주간 캘린더(center) · 카드 상세(가운데 탭) ──
    // ⛔ newTab 을 안 잡는다 — 「+」는 빈 탭(app.blank)이다(쥔님 13:15). 스케줄은 리본 「새 스케줄」로 연다
    host.views.register({
        id: 'week', title: '스케줄', icon: 'table', defaultArea: 'center',
        layout: { minWidth: 480, squeeze: 'scroll' },
        Component: (p) => createElement(WeekView, { ...p, store, onCardClick: openCard }),
    });
    host.views.register({
        id: 'card', title: '카드', icon: 'info', defaultArea: 'center',
        singleton: true, layout: { minWidth: 220 },
        Component: (p) => createElement(CardView, { ...p, store }),
    });

    // ── 명령 + 리본 동작「새 스케줄」(동작이지 뷰가 아니다) ──
    host.commands.add({
        id: 'scheduler.new', title: '새 스케줄', icon: 'table',
        run: () => { host.workspace.open('scheduler.week', { where: 'center' }); },
    });
    host.ribbon.add({ commandId: 'scheduler.new', icon: 'table', order: 0 });

    // ⛔ 설정 화면에 「스케줄러」 섹션을 박지 않는다 — 쥔님 2026-11-01 13:39: *"영구적·전략적인 기능이 아니다 보니
    //    설정 화면에 박을 수는 없어요"*. 눈금·시작 시각은 스케줄 뷰 안(툴바/머리줄)에서 만지는 것이 다음 손이다.
    //    (SchedulerSettingsPane 은 파일로 남겨 둔다 — 뷰 안으로 옮길 때 그대로 쓴다)

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
