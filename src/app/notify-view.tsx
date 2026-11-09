/**
 * 알림 패널 뷰(app.notify) — 창틀이 내장한 사이드 뷰. 주인 'app', 플러그인이 아니라 끌 수 없다.
 * 열기: 상태바 🔔 · 리본 🔔 · 명령 frame.view.notify (Workbench 가 명령·리본을 꽂는다).
 */
import { createElement } from 'react';
import { makeHost } from '../pane-ui-system/plugin';
import { NotifyPanel } from '../pane-ui-system';

makeHost('app', { components: { Notify: () => createElement(NotifyPanel) } })
    .declare({
        kind: 'view',
        id: 'notify', title: '알림', icon: 'bell', defaultArea: 'right',
        layout: { minWidth: 240, squeeze: 'shrink' },
        placement: { areas: ['right', 'left'], singleton: true },
        component: 'Notify',
    });
