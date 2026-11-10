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
import type { PluginHost, ViewProps, Disposable, CommandContext } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 노드 약속(explorer/contracts/nodes)에서(값 아님, 구조 검사 ⑱·g). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi } from '../explorer/contracts/nodes';
import type { RecordViewApi } from '../collection/contracts/collection';
import { manifest } from './manifest';
import { CalendarTab } from './views/CalendarTab';
// 📌 2026-11-09 쥔님 *"작은 달력도 일단 비활성화"* — 작은 달력(views/MiniCalendarView.tsx)은 코드만 남기고 뷰·명령·리본·첫 배치에서 뺐다.
//    되살릴 땐 contributes.views 의 'mini'·명령 'calendar.openMini'·리본·components.Mini·onFirstRun 을 git 이력에서 되돌린다.
// 📌 같은 날 *"시험보기도 그냥 없애"* — 설정 「달력」 판(시험 기능 보기 토글)을 걷었다. 전체 내보내기는 명령 팔레트에 남는다.
import { initOptions, setScope } from './store';
import { calendarModule } from './feed';
import { parseIcs, writeIcs } from './ics';
import { itemToIcs } from './io';
import { pickIcsFile, downloadText } from './file-io';
import {
    calendarNodeTypes, calendarNodeTypeImpl, initCalendarNodes, getNodesApi, setCalendarHost,
    setDefaultStore, newEventInStore,
    importItemsToStore, collectForExport, storeName, initCalendarKit, getKit,
} from './nodes';
// 🔴 구독 캘린더 — 2026-11-09 쥔님 *"달력 플러그인 안으로 들여라"* 로 별도 꾸러미에서 달력 안(subscribe/)으로 들였다.
//    달력이 자기 약속(calendar 모듈·parseIcs·registerSource)을 스스로 쓰는 소비자다 — 남의 플러그인용 입구는 그대로 열려 있다.
//    🔴 저장 노드 타입 이름(calendar-subscribe.subscription)·명령 id(calendar-subscribe.*)는 **안 바꿨다** — 이미 깔린
//       구독 노드가 그 타입으로 저장돼 있어, 이름을 바꾸면 byType 매치가 끊겨 데이터가 사라진다(유실 0 원칙).
import { initSubs, subscribeSubs, getSubsApi, getSubById, updateSub } from './subscribe/subscriptions';
import { subscribeNodeTypes, subscribeNodeTypeImpl, SUB_TYPE } from './subscribe/nodes';
import { SubLinkPane } from './subscribe/SubLinkPane';
import { setCalendar, reconcile, disposeAll as disposeSubs, refreshAllEnabled, refresh as refreshSub } from './subscribe/controller';
import { pickIcsText } from './subscribe/file-pick';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'calendar.' 를 붙인다 · 구조 검사가 접두사를 본다).
//    contributes.views 의 id 는 접두사 없는 'month'·'mini' 로 적고, 호스트가 붙인 뒤의 전체 id 를 여기서 연다.
const MONTH_ID = 'calendar.month';

// 구독 다리(노드 구독·달력 출처 등록) — deactivate 가 거둔다(옛 구독 꾸러미의 모듈 전역과 같은 결).
let subBridge: Disposable | null = null;
let kitBridge: Disposable | null = null;
let offSubs: (() => void) | null = null;

export const calendarPlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 M0 — 일정은 노드다(달력은 저장을 모른다). nodes 인터페이스가 없으면 달력이 의미가 없으니 requires.
        //    nodeTypes(저장소·일정)를 기여하므로 requires.nodes 는 호스트 검사에서도 필수다.
        requires: { nodes: '^0.1' },
        // 저장소 = 컬렉션(P4b) — 사용자 칸·「표로 보기」·일정 표 모드가 컬렉션을 빌린다. 없으면 달력 보기만 — 있으면 쓰는 것이라 supports
        supports: { 'collection': '^0.2', 'page-doc': '^0.1' },
        // 🔴 달력은 「calendar」 약속을 채운다 — 다른 플러그인이 남의 일정을 꽂는 입구(modules.calendar).
        provides: { calendar: '0.2.0' },
        // ── 「나는 이 뷰·명령·리본·설정을 낸다」 — 순수 데이터. 함수·컴포넌트는 아래 이름으로 가리킨다 ──
        contributes: {
            // 🔴 calendar 약속을 **들고 온다**(2026-11-08 「플러그인은 꾸러미다」). 달력 꾸러미가 약속·provides·화면을 한 폴더에 묶는다
            //    — 들고 오는 쪽과 채우는 쪽이 같아도 된다(소비자는 남의 일정을 modules.calendar 로 꽂는다).
            interfaces: [{ name: 'calendar', version: '0.2.0', label: '달력', desc: '달력에 넣는 일정' }],
            views: [
                // 월 보기(싱글턴·가운데·안 가름) — 아이콘은 'calendar'(쥔님 *"캘린더 스럽지 않아"* 로 'table' 에서 바꿈).
                {
                    id: 'month', title: '달력', icon: 'calendar', defaultArea: 'center',
                    placement: { areas: ['center'], singleton: true },
                    layout: { minWidth: 280, squeeze: 'scroll' },
                    component: 'Month',
                },
                // 「표로 보기」 — 저장소 하나의 일정을 컬렉션 표로(칸 추가·정렬·필터는 컬렉션 바닥이 낸다). 저장소 우클릭으로 연다.
                {
                    id: 'table', title: '일정 표', icon: 'table', defaultArea: 'center',
                    placement: { areas: ['center'], singleton: true },
                    layout: { minWidth: 280, squeeze: 'scroll' },
                    component: 'Table',
                },
            ],
            commands: [
                { id: 'calendar.open', title: '달력 열기', icon: 'calendar', keys: 'Mod+Alt+C' },
                { id: 'calendar.openStore', title: '달력에서 열기', icon: 'calendar' },
                { id: 'calendar.newEventIn', title: '새 일정', icon: 'plus' },
                { id: 'calendar.importIcs', title: 'ICS 가져오기', icon: 'upload' },
                { id: 'calendar.exportIcs', title: 'ICS 내보내기', icon: 'download' },
                { id: 'calendar.exportAll', title: '일정 전체 ICS 내보내기', icon: 'download' },
                { id: 'calendar.openTable', title: '표로 보기', icon: 'table' },
                // 구독 노드 우클릭 메뉴가 부르는 명령 넷(대상 노드는 subscribe/nodes 의 「메뉴가 가리킨 구독」에서 읽는다).
                { id: 'calendar-subscribe.refresh', title: '구독 새로고침', icon: 'redo' },
                { id: 'calendar-subscribe.from-file', title: '구독 파일로 갱신', icon: 'upload' },
                { id: 'calendar-subscribe.export', title: '구독 내보내기', icon: 'download' },
                { id: 'calendar-subscribe.change-link', title: '구독 링크 바꾸기', icon: 'edit' },
                { id: 'calendar-subscribe.toggle', title: '구독 켜기/끄기', icon: 'eye' },
            ],
            // 리본 아이콘 하나 — 월 보기(calendar·order 1). 작은 달력 리본은 2026-11-09 비활성화로 뺐다.
            ribbon: [
                { commandId: 'calendar.open', icon: 'calendar', order: 1 },
            ],
            // 🔴 노드 타입 둘(저장소·일정) — 선언형 전환 D5. 활성 때 applyContributes 가 노드 레지스트라(탐색기)에 통째로 넘긴다.
            //    함수(open·menu)는 아래 nodeTypes(calendarNodeTypeImpl)에 impl 'store' 로 가리킨다 — 옛 onActivate 의 registerCalendarTypes 를 대체.
            //    🔴 구독 노드 타입(impl 'sub')도 같이 낸다 — 구독 하나 = 탐색기에 보이는 노드(subscribe/nodes).
            nodeTypes: [...calendarNodeTypes, ...subscribeNodeTypes],
            // 구독 노드를 고르면 속성 패널에 링크 칸(쥔님 2026-11-09 — 노드 이름 자리에 링크 치던 것 대신).
            //    🔴 일정은 속성 패널 칸이 없다 — 🙋 7 A: 레코드는 열기 페이지(EventCardPeek) 하나에서 고친다.
            properties: [
                { target: SUB_TYPE, id: 'sub-link', title: '구독', pane: 'SubLink' },
            ],
        },
    },

    // ── 이름 붙인 구현 — 호스트가 contributes 의 이름으로 찾아 꽂는다(p.host 로 호스트가 끼워져 온다) ──
    components: {
        // 탭 하나 안에서 월·연·주·3일·하루 전환(CalendarTab). 🔴 일정 카드는 창틀 미리보기(peek)에 — ViewProps.peek 을 내린다.
        Month: (p: ViewProps & { host: PluginHost }) => createElement(CalendarTab, { peek: p.peek, host: p.host, leafId: p.leaf?.id }),
        // 표 화면은 컬렉션 바닥이 낸다 — 활성 때 만든 kit 를 부를 때마다 읽는다(collection 이 없으면 빈 화면).
        Table: ({ host, peek, leaf }: ViewProps & { host: PluginHost }) => { const k = getKit(); return k ? createElement(k.Tab, { host, peek, leafId: leaf.id }) : null; },
    },
    panes: { SubLink: SubLinkPane },
    commands: {
        // 리본 「달력 열기」는 범위를 전체(null)로 — 저장소 하나로 좁혀 보던 걸 풀고 모든 저장소 일정을 본다(쥔님 2026-11-02).
        'calendar.open': (host: PluginHost) => { setScope(null); host.workspace.open(MONTH_ID, { where: 'center' }); },
        // 저장소 우클릭 「달력에서 열기」 — 대상은 nodes.ts 의 「메뉴가 가리킨 저장소」(ContextMenu 는 인자를 안 싣는다).
        'calendar.openStore': (_host: PluginHost, ctx?: CommandContext) => { const id = ctx?.nodeId; if (id) getNodesApi()?.open(id); },
        // 저장소 우클릭 「새 일정」 — 오늘 종일 일정 + 「열 카드」로 담고 월 보기를 연다.
        'calendar.newEventIn': (host: PluginHost, ctx?: CommandContext) => {
            const id = ctx?.nodeId;
            if (!id) return;
            setDefaultStore(id);
            if (!newEventInStore(id)) return;                      // 오늘 종일 일정 + 「열 카드」로 담기
            host.workspace.open(MONTH_ID, { where: 'center' });    // 월 보기(마운트/구독 때 카드를 연다)
        },
        // 저장소 우클릭 「ICS 가져오기」 — .ics 파일을 골라 그 저장소에 내 일정으로 복사(UID 중복 제외). 끝나면 그 저장소 달력을 연다.
        'calendar.importIcs': (host: PluginHost, ctx?: CommandContext) => {
            const storeId = ctx?.nodeId;
            if (!storeId) return;
            pickIcsFile((text) => {
                importItemsToStore(storeId, parseIcs(text));   // {created, skipped} — 중복은 UID 로 거른다
                setScope(storeId);
                host.workspace.open(MONTH_ID, { where: 'center' });
            });
        },
        // 저장소 우클릭 「ICS 내보내기」 — 그 저장소(+자손) 내 일정을 .ics 파일로 내려받는다.
        'calendar.exportIcs': (_host: PluginHost, ctx?: CommandContext) => {
            const storeId = ctx?.nodeId;
            if (!storeId) return;
            downloadText(`${storeName(storeId)}.ics`, writeIcs(collectForExport(storeId)));
        },
        // 「일정 전체 ICS 내보내기」(설정 판 단추·팔레트) — 모든 저장소 내 일정을 한 파일로.
        'calendar.exportAll': () => { downloadText('달력 전체.ics', writeIcs(collectForExport(null))); },
        // 저장소 우클릭 「표로 보기」 — 그 저장소를 컬렉션 표로(보고 있는 목록 = 그 저장소).
        'calendar.openTable': (host: PluginHost, ctx?: CommandContext) => { const id = ctx?.nodeId; if (id) getKit()?.open(host, id); },
        // ── 구독 노드 우클릭 명령 넷(대상은 CommandContext.nodeId) ──
        // 새로고침 — 그 구독을 다시 받는다(브라우저 네트워크에서만 실제로 돈다).
        'calendar-subscribe.refresh': (_host: PluginHost, ctx?: CommandContext) => { const id = ctx?.nodeId; if (id) void refreshSub(id); },
        // 파일로 갱신 — .ics 파일을 골라 lastIcs 로 넣는다(CORS 로 링크가 안 받힐 때).
        'calendar-subscribe.from-file': (_host: PluginHost, ctx?: CommandContext) => {
            const id = ctx?.nodeId;
            if (!id) return;
            pickIcsText((text) => updateSub(id, { lastIcs: text, lastFetched: Date.now(), lastError: undefined }));
        },
        // 내보내기 — 그 구독이 받아 둔 일정(lastIcs)을 우리 작성기 꼴 .ics 로 내려받는다(파일 이름은 노드 이름).
        'calendar-subscribe.export': (_host: PluginHost, ctx?: CommandContext) => {
            const id = ctx?.nodeId;
            const sub = id ? getSubById(id) : undefined;
            if (!sub) return;
            const items = parseIcs(sub.data.lastIcs ?? '');
            downloadText(`${sub.name || '구독'}.ics`, writeIcs(items.map(itemToIcs)));
        },
        // 링크 바꾸기 — 탐색기 인라인 입력(현재 링크를 미리 채운다) · 커밋은 subscribe/nodes.onInput(kind:'link')으로.
        'calendar-subscribe.change-link': (_host: PluginHost, ctx?: CommandContext) => {
            const id = ctx?.nodeId;
            const api = getSubsApi();
            if (!id || !api) return;
            api.promptInput(id, { kind: 'link', initial: getSubById(id)?.data.url ?? '', placeholder: '달력 링크(.ics)' });
        },
        // 켜기/끄기 — 끄면 달력에서 그 구독이 빠진다(reconcile 가 다시 그린다). 내 일정은 그대로.
        'calendar-subscribe.toggle': (_host: PluginHost, ctx?: CommandContext) => {
            const id = ctx?.nodeId;
            if (!id) return;
            updateSub(id, { enabled: !(getSubById(id)?.data.enabled ?? true) });
        },
    },
    // 🔴 노드 타입 함수 묶음 — impl 'store'(저장소 open·menu) + 'sub'(구독 open·menu·createInit·onInput). 일정은 순수 데이터라 없다.
    nodeTypes: { ...calendarNodeTypeImpl, ...subscribeNodeTypeImpl },
    // 🔴 calendar 약속을 채우는 모듈 — provides.calendar 와 짝(키 이름이 같아야 tsc 가 통과). 남의 일정 입구.
    modules: { calendar: calendarModule },

    lifecycle: {
        /**
         * 선언 안 되는 것만 — 스토어 초기화·노드 다리 구독(노드 타입 등록은 contributes.nodeTypes 가 끝냈다).
         *   🔴 ⛔ 여기서 탭을 열지 않는다(등록은 contributes 가, 첫 배치는 onFirstRun 이 한다).
         */
        onActivate(host: PluginHost) {
            // 옵션(「시험 기능 보기」 — 기본 꺼짐)을 기기별 저장소에서 읽어 온다 · 설정 「달력」 판에서 켠다
            initOptions(host);

            // ── 일정 자료 다리를 건다 — 🔴 일정은 노드다. 달력은 저장을 모른다(요구명세).
            //    노드 타입 둘(저장소·일정)은 contributes.nodeTypes 가 applyContributes(= onActivate 보다 먼저)에서 꽂았다.
            //    탐색기가 없거나 꺼졌으면 조용히 빈 상태로 돈다.
            const nodes = host.modules.use<NodesApi>('nodes');
            initCalendarNodes(nodes ?? null);
            setCalendarHost(host);
            kitBridge = initCalendarKit(host.modules.use<RecordViewApi>('collection') ?? null, nodes ?? null);

            // ── 구독 다리 — 구독 노드(subscribe/)를 켜진 것만 달력 출처로 꽂는다. 달력은 자기 calendarModule 을 바로 쓴다
            //    (남의 플러그인은 host.modules.use('calendar') 로 받지만, 달력 자신은 같은 꾸러미라 모듈을 직접 건넨다).
            //    🔴 구독 노드가 바뀌면(추가·끄기·lastIcs·이름·삭제) reconcile 로 다시 등록 · 열 때 켜진 구독을 새로 받는다.
            subBridge = initSubs(nodes ?? null);
            setCalendar(calendarModule);
            reconcile();
            offSubs = subscribeSubs(reconcile);
            refreshAllEnabled();   // 열 때 받기 — 네트워크(브라우저)에서만 실제로 돈다
        },
        /**
         * 첫 실행 기본 배치: 가운데 달력 탭 하나(쥔님 2026-11-01 21:47 · 작은 달력은 2026-11-09 비활성화로 뺐다).
         *   🔴 ⛔ 기기별 플래그라 한 번만 — 이미 쓰던 기기는 저장된 워크스페이스가 있어 안 바뀐다(⛔ 저장된 배치를 덮지 않는다).
         */
        onFirstRun(host: PluginHost) {
            host.workspace.open(MONTH_ID, { where: 'center' });
        },
    },
    // 구독 다리 거두기 — 노드 구독 해제 + 등록한 달력 출처 전부 dispose(달력 참조도 놓는다).
    deactivate() {
        offSubs?.();
        offSubs = null;
        subBridge?.dispose();
        subBridge = null;
        kitBridge?.dispose();
        kitBridge = null;
        disposeSubs();
    },
});

export default calendarPlugin;
