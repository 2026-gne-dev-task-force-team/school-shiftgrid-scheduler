/**
 * 「복무 대장」 플러그인 — 대장(duty.list)·사람(duty.person) 노드 둘 + 대장 화면 하나(요구명세 2026-11-08).
 *   ⭐ 선언형 전환(달력과 같은 결): 뷰·명령·리본·노드 타입을 contributes 에 「적고」, 실행 함수·컴포넌트는 이름으로 가리킨다.
 *     🔴 ⛔ 선언 안 되는 것만 onActivate 에 — 노드 다리(modules.use('nodes'))뿐이다.
 *
 *   층(요구명세): ① duty(이것) 은 대장과 사람만 안다 — 학교·계정 모름. 위층(school-roster·계정)이 이 약속에 기대어 증축한다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, CommandContext } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 약속 플러그인에서(값 아님). 값은 host.modules.use('nodes') 로 받는다.
import { manifest } from './manifest';
import { dutyNodeTypes, dutyNodeTypeImpl, initDuty, getKit } from './nodes';
import { dutyApi } from './api';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'duty.' 를 붙인다). contributes 엔 접두사 없는 'sheet' 로 적는다.
const SHEET_ID = 'duty.sheet';

export const dutyPlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 duty 인터페이스를 채운다(provides) — 모듈 값은 아래 modules.duty(짝). 학교 명부·계정이 이걸 읽는다.
        provides: { duty: '0.1.0' },
        // 🔴 대장·사람은 노드다 — nodes 없으면 의미가 없으니 requires(nodeTypes 를 기여하므로 호스트 검사에서도 필수).
        //    대장은 컬렉션 바닥(collection)으로 짠다 — 없으면 의미가 없으니 requires(옛 간이 표 갈래는 걷었다). 줄 문서는 있으면 쓰니 supports.
        requires: { nodes: '^0.1', 'collection': '^0.2' },
        supports: { 'page-doc': '^0.1' },
        contributes: {
            // 🔴 duty 약속을 **들고 온다**(2026-11-08 「플러그인은 꾸러미다」). 복무 대장 꾸러미가 약속·provides·화면을 한 폴더에.
            interfaces: [{ name: 'duty', version: '0.1.0', label: '복무', desc: '교직원의 출장·연수·휴가 기록과 「그 시간 누가 없나」 셈' }],
            // 대장 화면(싱글턴·가운데·안 가름 — 달력 월 보기와 같은 placement).
            views: [{
                id: 'sheet', title: '복무 대장', icon: 'calendar', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Sheet',
            }],
            commands: [
                { id: 'duty.open', title: '복무 대장 열기', icon: 'calendar', keys: 'Mod+Alt+D' },
                { id: 'duty.openLedger', title: '대장 열기', icon: 'calendar', palette: false },
            ],
            ribbon: [{ commandId: 'duty.open', icon: 'calendar', order: 3 }],
            // 🔴 노드 타입 둘(대장·사람) — 활성 때 applyContributes 가 노드 레지스트라(탐색기)에 통째로 넘긴다.
            nodeTypes: dutyNodeTypes,
        },
    },

    // 🔴 화면은 컬렉션 바닥이 낸다 — 활성 때 만든 kit 를 부를 때마다 읽는다(활성 전엔 빈 화면). 사람은 속성 패널이 아니라 「열기」 페이지로 연다.
    components: {
        Sheet: ({ host, peek, leaf }) => { const k = getKit(); return k ? createElement(k.Tab, { host, peek, leafId: leaf.id }) : null; },
    },
    commands: {
        // 리본 「복무 대장 열기」 — 보고 있는 대장은 그대로 두고 화면만 연다(없으면 안내가 뜬다).
        'duty.open': (host: PluginHost) => { host.workspace.open(SHEET_ID, { where: 'center' }); },
        // 대장 우클릭 「대장 열기」 — 대상은 kit 의 「메뉴가 가리킨 대장」(open 이 보고 있는 대장 정하기 + 화면 열기).
        'duty.openLedger': (_host: PluginHost, ctx?: CommandContext) => { getKit()?.openList(ctx?.nodeId); },
    },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'list' 가 가리킨다(대장 open·menu). 사람은 순수 데이터라 없다.
    nodeTypes: dutyNodeTypeImpl,
    // 🔴 duty 인터페이스를 채우는 모듈(provides 와 짝). host.modules.use<Duty>('duty') 가 이걸 받는다.
    modules: { duty: dutyApi },

    lifecycle: {
        /**
         * 선언 안 되는 것만 — 컬렉션 kit 만들기 + 노드 다리 구독(노드 타입 등록은 contributes.nodeTypes 가 끝냈다).
         *   🔴 ⛔ 여기서 화면을 열지 않는다 · 대장을 자동 생성하지 않는다(쥔님이 탐색기에서 만든다).
         */
        onActivate(host: PluginHost) { initDuty(host); },
    },
});

export default dutyPlugin;
