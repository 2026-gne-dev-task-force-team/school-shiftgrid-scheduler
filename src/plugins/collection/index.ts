/**
 * 「collection」 꾸러미 — 공통 목록 화면 부품(레코드 뷰)을 담은 한 플러그인. ⭐ P1: 탐색기에서 「새로 만들기 ▸ 레코드 뷰」로 빈 레코드 뷰(노드)를 만들어 칸·행을 직접 만든다.
 *   🔴 부품(RecordView·Cell·Toolbar·Popover) + 순수 로직(필터·정렬·검색) + 보기 상태 + 알약 색 + 노드 화면이
 *     모두 이 폴더 안에 산다(2026-11-08 「플러그인은 꾸러미다」). pane-ui-system(창틀 엔진)은 도메인 없는
 *     자리라 목록 화면 부품은 거기 안 산다 — 이 꾸러미로 내려왔다.
 *   약속(collection 타입)은 contracts/collection.ts 에 있고, 매니페스트 contributes.interfaces 로 들고 온다.
 *   제공(provides: collection · 모듈 값 recordViewApi)으로 채운다 — 손님은 host.modules.use<RecordViewApi>('collection').
 *   ⭐ 2026-11-09 「연습장」을 걷었다(쥔님) — 리본은 다른 꾸러미처럼 노드 화면을 연다(보던 게 없으면 첫 레코드 뷰).
 */
import { useEffect } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, CommandContext } from '../../pane-ui-system/plugin';
import type { ViewProps } from '../../pane-ui-system';
// 🔴 import type 만 — 약속 타입은 약속 플러그인의 contracts 에서(값 아님). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi } from '../explorer/contracts/nodes';
import { manifest } from './manifest';
import { recordViewApi } from './api';
import { DbView } from './views/DbView';
import { recordNodeTypes, recordNodeTypeImpl, initRecordNodes, restoreTrashedRows } from './nodes';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'collection.' 를 붙인다). contributes 엔 접두사 없는 'db' 로.
const DB_ID = 'collection.db';

/** 옛 「레코드 뷰 연습장」 잔재 탭 — 저장된 레이아웃에 남아 있으면 들어와 닫고 레코드 뷰 화면으로 잇는다(표 편집기와 같은 길). */
function LegacyPlaygroundRedirect({ host, leaf }: ViewProps & { host: PluginHost }) {
    useEffect(() => {
        // 🔴 복원 시동 중엔 작업대 다리가 아직 안 서 있다(open 이 null) — 설 때까지 몇 번 다시 시도한 뒤 잇고 닫는다.
        let tries = 0;
        let timer = 0;
        const attempt = (): void => {
            const opened = host.workspace.open(DB_ID, { where: 'center' });
            if (opened == null && tries < 40) { tries += 1; timer = window.setTimeout(attempt, 50); return; }
            host.workspace.close(leaf.id);
        };
        attempt();
        return () => window.clearTimeout(timer);
    }, [host, leaf.id]);
    return null;
}

export const collectionPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { 'collection': '0.2.0' },
        // 🔴 레코드 뷰도 노드다 — nodeTypes 를 기여하므로 requires.nodes 는 호스트 검사에서도 필수다.
        requires: { nodes: '^0.1' },
        // 줄 문서 — 페이지 편집기가 있으면 줄마다 문서를 붙인다(없으면 칸만)
        supports: { 'page-doc': '^0.1' },
        contributes: {
            // 🔴 collection 약속을 들고 온다(꾸러미 매니페스트) — 켜진 collection 가 호스트 약속 목록에 collection 를 올린다.
            interfaces: [{ name: 'collection', version: '0.2.0', label: '목록 화면', desc: '목록을 보고 고치는 공통 화면' }],
            views: [{
                // 레코드 뷰 노드 화면 — 가운데 싱글턴(한 장만). 보고 있는 레코드 뷰 노드를 그린다.
                id: 'db', title: '컬렉션', icon: 'database', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 320, squeeze: 'scroll' },
                component: 'Db',
            }, {
                // 옛 「레코드 뷰 연습장」 잔재 탭 — 들어오면 바로 닫고 레코드 뷰 화면으로 잇는다(위 LegacyPlaygroundRedirect).
                id: 'playground', title: '컬렉션 연습장', icon: 'layers', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                component: 'LegacyPlayground',
            }],
            commands: [
                { id: 'collection.open', title: '컬렉션 열기', icon: 'layers' },
                { id: 'collection.restoreTrashed', title: '휴지통의 행 복원', icon: 'undo' },
            ],
            ribbon: [{ commandId: 'collection.open', icon: 'layers', order: 20 }],
            // 🔴 노드 타입 둘(레코드 뷰·행) — 활성 때 applyContributes 가 노드 레지스트라(탐색기)에 통째로 넘긴다.
            nodeTypes: recordNodeTypes,
        },
    },

    components: {
        // 옛 연습장 탭 자동 정리 — host·leaf 를 받아 닫고 레코드 뷰로 잇는다(위 redirect).
        LegacyPlayground: LegacyPlaygroundRedirect,
        // 레코드 뷰 노드 화면 — host 로 탐색기 되돌리기 명령을 부른다.
        Db: DbView,
    },
    commands: {
        // 리본 「레코드 뷰 열기」 — 보던 레코드 뷰가 없으면 첫 레코드 뷰를 잡고 연다(하나도 없으면 안내).
        // 보던 게 없으면 시작 화면이 뜬다(새로 만들기 + 목록) — 다른 목록 꾸러미와 같은 결(옛 「첫 것 자동 고르기」 걷음)
        'collection.open': (host: PluginHost) => { host.workspace.open(DB_ID, { where: 'center' }); },
        // 탐색기 우클릭 「휴지통의 행 N개 복원」 — 메뉴가 가리킨 레코드 뷰의 휴지통 행을 되살린다.
        'collection.restoreTrashed': (host: PluginHost, ctx?: CommandContext) => { const id = ctx?.nodeId; if (id) restoreTrashedRows(id, (title) => host.notify({ level: 'warn', title, key: 'collection.restore' })); },
    },
    // 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'db' 가 가리킨다(열기·새로 만들기 초기값·메뉴).
    nodeTypes: recordNodeTypeImpl,
    // 🔴 collection 인터페이스를 채우는 모듈(provides 와 짝). host.modules.use<RecordViewApi>('collection') 가 이걸 받는다.
    modules: { 'collection': recordViewApi },

    lifecycle: {
        // 선언 안 되는 것만 — 노드 다리 구독(노드 타입 등록은 contributes.nodeTypes 가 끝냈다).
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            initRecordNodes(nodes ?? null);
        },
    },
});
export default collectionPlugin;
