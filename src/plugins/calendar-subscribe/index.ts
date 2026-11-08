/**
 * 「구독 캘린더」 플러그인 — 링크(.ics)로 받은 남의 달력을 달력에 읽기 전용으로 꽂는다(쥔님 2026-11-08).
 *   🔴 달력과 별도 꾸러미 — 달력은 남의 플러그인을 모른다. 이 꾸러미가 host.modules 로 calendar 약속을 받아 registerSource 한다
 *      (feed-integration.test 의 소비자와 같은 결). 구독은 노드로 저장(프로젝트 데이터와 함께 동기화 · lastIcs 로 오프라인).
 *
 * 선언형: 설정 판·노드 타입을 contributes 로 적고, 구독↔달력 잇기(구독·재등록·받기)는 lifecycle 에 둔다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
// 🔴 타입만 — 약속은 각 꾸러미 contracts/ 에서(값은 host.modules.use). 구조 검사 ⑱·g.
import type { NodesApi } from '../project-explorer/contracts/nodes';
import type { Calendar } from '../calendar/contracts/calendar';
import { manifest } from './manifest';
import { SubscribeSettings } from './settings/SubscribeSettings';
import { SUB_TYPE, initSubs, subscribeSubs } from './subscriptions';
import { setCalendar, reconcile, disposeAll, refreshAllEnabled } from './controller';
import type { Disposable } from '../../pane-ui-system/plugin';

// 모듈 전역(달력 nodes.ts·store.ts 와 같은 결) — deactivate 가 거둔다.
let subBridge: Disposable | null = null;
let offSubs: (() => void) | null = null;

export const calendarSubscribePlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 구독은 노드로 저장(nodes) · 남의 일정은 달력에 꽂는다(calendar) — 둘 다 없으면 의미가 없어 requires.
        requires: { nodes: '^0.1', calendar: '^0.1' },
        contributes: {
            // 구독 하나 = record 노드(탐색기에 안 보임). 순수 데이터(impl 없음).
            nodeTypes: [{ type: SUB_TYPE, label: '구독 캘린더', icon: 'calendar', record: true }],
            // 설정 「구독 캘린더」 판 — 목록 + 「링크로 구독」.
            settings: {
                sections: [{ id: 'calendar-subscribe', title: '구독 캘린더', icon: 'calendar' }],
                items: [{ section: 'calendar-subscribe', id: 'calendar-subscribe', title: '구독', icon: 'calendar', pane: 'Settings' }],
            },
        },
    },
    panes: {
        Settings: (_p: { host: PluginHost }) => createElement(SubscribeSettings),
    },
    lifecycle: {
        /**
         * 노드 다리 + 달력 다리를 걸고, 켜진 구독을 달력에 등록한다. 구독 노드가 바뀌면 다시 등록(reconcile).
         *   🔴 열 때 켜진 구독을 새로 받는다(refreshAllEnabled) — 받으면 lastIcs 갱신 → 노드 변경 → reconcile 로 다시 그린다.
         */
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            subBridge = initSubs(nodes ?? null);
            setCalendar(host.modules.use<Calendar>('calendar') ?? null);
            reconcile();
            offSubs = subscribeSubs(reconcile);
            refreshAllEnabled();   // 열 때 받기 — 네트워크(브라우저)에서만 실제로 돈다
        },
    },
    deactivate() {
        offSubs?.();
        offSubs = null;
        subBridge?.dispose();
        subBridge = null;
        disposeAll();
    },
});

export default calendarSubscribePlugin;
