/**
 * 「구독 캘린더」 플러그인 — 링크(.ics)로 받은 남의 달력을 달력에 읽기 전용으로 꽂는다(쥔님 2026-11-08).
 *   🔴 달력과 별도 꾸러미 — 달력은 남의 플러그인을 모른다. 이 꾸러미가 host.modules 로 calendar 약속을 받아 registerSource 한다.
 *   🔴 구독 하나 = **탐색기에 보이는 노드**(쥔님 2026-11-08 "구독도 노드로"). 만들기·메뉴·여는 자리는 달력 저장소 노드와 같은 관례
 *      (nodes.ts 의 nodeTypes·create·menu·open). 저장(링크·색·lastIcs·켜짐)은 노드 data 에 — 프로젝트와 함께 동기화·오프라인.
 *   📌 옛 설정 판 「구독 캘린더」는 걷었다 — 노드 하나로(두 곳에서 다르게 고쳐지는 일이 없게). 관리는 전부 탐색기에서.
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
// 🔴 타입만 — 약속은 각 꾸러미 contracts/ 에서(값은 host.modules.use). 구조 검사 ⑱·g.
import type { NodesApi } from '../project-explorer/contracts/nodes';
import type { Calendar } from '../calendar/contracts/calendar';
import { manifest } from './manifest';
import { initSubs, subscribeSubs, getSubsApi, getSubById, updateSub } from './subscriptions';
import { subscribeNodeTypes, subscribeNodeTypeImpl, getMenuTarget } from './nodes';
import { setCalendar, reconcile, disposeAll, refreshAllEnabled, refresh } from './controller';
import { pickIcsText } from './file-pick';
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
            // 🔴 구독 하나 = 보이는 노드(record 없음). 만들 때 링크 인라인 입력 · 열면 달력 탭 — 함수는 impl 'sub'.
            nodeTypes: subscribeNodeTypes,
            // 노드 우클릭 메뉴가 부르는 명령 넷(대상 노드는 nodes.ts 의 「메뉴가 가리킨 구독」에서 읽는다).
            commands: [
                { id: 'calendar-subscribe.refresh', title: '구독 새로고침', icon: 'redo' },
                { id: 'calendar-subscribe.from-file', title: '구독 파일로 갱신', icon: 'upload' },
                { id: 'calendar-subscribe.change-link', title: '구독 링크 바꾸기', icon: 'edit' },
                { id: 'calendar-subscribe.toggle', title: '구독 켜기/끄기', icon: 'eye' },
            ],
        },
    },
    commands: {
        // 새로고침 — 그 구독을 다시 받는다(브라우저 네트워크에서만 실제로 돈다).
        'calendar-subscribe.refresh': () => { const id = getMenuTarget(); if (id) void refresh(id); },
        // 파일로 갱신 — .ics 파일을 골라 lastIcs 로 넣는다(CORS 로 링크가 안 받힐 때).
        'calendar-subscribe.from-file': () => {
            const id = getMenuTarget();
            if (!id) return;
            pickIcsText((text) => updateSub(id, { lastIcs: text, lastFetched: Date.now(), lastError: undefined }));
        },
        // 링크 바꾸기 — 탐색기 인라인 입력(현재 링크를 미리 채운다) · 커밋은 nodes.onInput(kind:'link')으로.
        'calendar-subscribe.change-link': () => {
            const id = getMenuTarget();
            const api = getSubsApi();
            if (!id || !api) return;
            api.promptInput(id, { kind: 'link', initial: getSubById(id)?.data.url ?? '', placeholder: '달력 링크(.ics)' });
        },
        // 켜기/끄기 — 끄면 달력에서 그 구독이 빠진다(reconcile 가 다시 그린다). 내 일정은 그대로.
        'calendar-subscribe.toggle': () => {
            const id = getMenuTarget();
            if (!id) return;
            updateSub(id, { enabled: !(getSubById(id)?.data.enabled ?? true) });
        },
    },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'sub' 가 가리킨다(open·menu·createInit·onInput).
    nodeTypes: subscribeNodeTypeImpl,
    lifecycle: {
        /**
         * 노드 다리 + 달력 다리를 걸고, 켜진 구독을 달력에 등록한다. 구독 노드가 바뀌면(추가·끄기·lastIcs·이름·삭제) 다시 등록(reconcile).
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
