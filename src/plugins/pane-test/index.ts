/**
 * 「팬 UI 엔진 테스트」 플러그인 — 창틀을 눈으로 시험하는 하네스(쥔님 2026-11-01).
 *   쥔님: *"리본에 데모 아이콘 하나 눌리면, 데모 탭 하나 열리고, 거기 안에서 다양한 레이아웃 테스트"* ·
 *         *"패널 ABCD 탭 가나다라, 테스트해 볼 수 있는 여러 창 타입 에뮬레이트"* ·
 *         *"생성하기 버튼은 아무 데서나 만들지 말고"*(→ 생성 단추는 시험 탭 안에만).
 *
 * ⭐ 플러그인 API 를 한 칸씩 쓰는 증명도 겸한다 — 뷰·리본·명령·상태바·설정 섹션·이벤트 구독.
 *    ⚠️ host-api.test.ts 와 중복으로 또 테스트를 만들지 않는다(거긴 그대로 둔다) — 여기선 실동작으로 쓴다.
 *
 * 🔴 선언형 전환(2026-11-02 D4) — 「부르지 말고 적어라」. 등록(뷰·명령·리본·설정·상태바)은 전부
 *    manifest.contributes 로 적어 두고, 실행에 필요한 함수·컴포넌트는 아래 components·commands·panes·renders
 *    로 이름 붙여 내놓는다. 짝은 호스트가 맞춘다(안드로이드 매니페스트 결). 옛 5종 register/add 는 안 쓴다.
 *   ⭐ 「동적인 것은 어디 남나」의 본보기: 상태바가 둘로 갈린다 —
 *      · open-count 는 늘 뜨니 **선언**(contributes.statusBar)이고, 그 수를 세는 workspace.on 구독만 onActivate 에 남는다.
 *      · node-count 는 탐색기 api 가 있을 때만 뜨니 **조건부라 선언이 아니다** — onActivate 에서 host.declare 로 급조한다.
 *    선언에는 조건이 없다(명세 「여기서 죽는다: 조건부 등록」) — 조건이 붙는 것만 declare 로 간다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, ViewProps, ViewContribution, CommandContribution } from '../../pane-ui-system/plugin';
// 🔴 약속의 「타입만」 import(import type) — 노드 약속(project-explorer/contracts/nodes)에서. 값은 host.modules.use('nodes') 로만(구조 검사 ⑱·g).
import type { NodesApi } from '../project-explorer/contracts/nodes';
import { manifest } from './manifest';
import { TestConsole } from './views/TestConsole';
import { SampleView } from './views/SampleView';
import { PaneTestSettings } from './settings/PaneTestSettings';
import { OpenCountStatus } from './components/OpenCountStatus';
import { NodeCountStatus } from './components/NodeCountStatus';
import { setOpenViewCount, setNodeCount, openCmdId } from './store';

const CONSOLE_ID = 'pane-test.console';
const OPEN_CMD = 'pane-test.open';

/** 시험 뷰 목록 — 각자 다른 색(tone)·이름·기본 자리. 전부 자유 배치(끌어 가르기·사이드바로 옮겨 시험). */
const SAMPLES: { id: string; title: string; tone: number; where: 'left' | 'right' | 'center'; scroll?: boolean }[] = [
    { id: 'panel-a', title: '패널 A', tone: 0, where: 'left' },
    { id: 'panel-b', title: '패널 B', tone: 1, where: 'right' },
    { id: 'panel-c', title: '패널 C', tone: 2, where: 'center' },
    { id: 'panel-d', title: '패널 D', tone: 3, where: 'center' },
    { id: 'tab-ga', title: '탭 가', tone: 4, where: 'center' },
    { id: 'tab-na', title: '탭 나', tone: 5, where: 'center' },
    { id: 'tab-da', title: '탭 다', tone: 6, where: 'center' },
    { id: 'tab-ra', title: '탭 라', tone: 7, where: 'center' },
    { id: 'scroll', title: '스크롤 시험', tone: 8, where: 'center', scroll: true },
];

/** viewId(접두사 붙은 full id) → SAMPLES 항목. Sample 컴포넌트가 제 leaf 로 어느 샘플인지 안다(한 컴포넌트가 아홉을 그린다). */
const sampleOf = (viewId: string) => SAMPLES.find((s) => viewId === `pane-test.${s.id}`);

// ── 이름 붙인 구현 — contributes 가 이름으로 가리킨다(함수·컴포넌트는 적는 게 아니다). 전부 첫 인자/props 로 host 가 꽂혀 온다 ──

/** 뷰 컴포넌트 둘: 시험 탭(Console) · 샘플 하나를 그리는 Sample(leaf 로 어느 샘플인지 가린다). */
const components = {
    // 시험 탭 — 🔴 p.peek 을 넘긴다(피크는 이 탭 안에서 뜬다, 전역 창 아님). host 는 꽂혀 들어온다.
    Console: (p: ViewProps & { host: PluginHost }) => createElement(TestConsole, { host: p.host, peek: p.peek }),
    // 샘플 뷰 — 제 leaf.viewId 로 SAMPLES 를 찾아 제목·색·스크롤을 집는다(아홉 뷰가 이 하나를 공유).
    Sample: (p: ViewProps & { host: PluginHost }) => {
        const s = sampleOf(p.leaf.viewId);
        return createElement(SampleView, { title: s?.title ?? p.leaf.viewId, tone: s?.tone ?? 0, scroll: s?.scroll, p });
    },
};

/** 명령 실행 함수 — 이름(= 명령 id)으로 가리킨다. 전부 첫 인자로 host(안드로이드 Activity 의 Context). */
const commands: Record<string, (host: PluginHost) => void> = {
    // 리본·팔레트가 부르면 시험 탭을 연다(싱글턴이라 두 장 안 열린다)
    [OPEN_CMD]: (host) => { host.workspace.open(CONSOLE_ID, { where: 'center' }); },
};
// 🔴 시험 뷰 열기도 전부 명령으로 — 콘솔 단추·팔레트가 같은 id 로 부른다(「모든 동작은 명령」).
for (const s of SAMPLES) {
    commands[openCmdId(s.id)] = (host) => { host.workspace.open(`pane-test.${s.id}`, { where: s.where }); };
}

/** 설정 Pane — 이름(pane)으로 가리킨다. props.host 로 호스트가 꽂혀 온다. */
const panes = {
    Settings: ({ host }: { host: PluginHost }) => createElement(PaneTestSettings, { host }),
};

/** 상태바 render — 이름(render)으로 가리킨다. host 로 storage 읽기 등(여기선 스토어 구독 컴포넌트를 건다). */
const renders = {
    OpenCount: () => createElement(OpenCountStatus),
    NodeCount: () => createElement(NodeCountStatus),
};

// ── 선언(contributes) 으로 적는 것 — 전부 순수 데이터(id·제목·아이콘·자리·단축키). 함수는 위 이름으로만 가리킨다 ──

/** 시험 탭(싱글턴·가운데·안 가름) + 샘플 아홉(자유 배치). */
const viewDefs: ViewContribution<'Console' | 'Sample'>[] = [
    {
        id: 'console', title: 'Pane UI Test', icon: 'flask', defaultArea: 'center',
        placement: { areas: ['center'], singleton: true },
        layout: { minWidth: 240, squeeze: 'scroll' },
        component: 'Console',
    },
    ...SAMPLES.map((s): ViewContribution<'Console' | 'Sample'> => ({
        id: s.id, title: s.title, icon: 'dot', defaultArea: 'center',
        layout: s.scroll ? { minWidth: 160, squeeze: 'scroll' } : { minWidth: 140 },
        component: 'Sample',
    })),
];

/** 명령: 시험 탭 열기(리본에 선다) + 샘플 아홉 열기(아이콘·제목만 다르다). */
const commandDefs: CommandContribution[] = [
    { id: OPEN_CMD, title: 'Pane UI Test 열기', icon: 'flask' },
    ...SAMPLES.map((s): CommandContribution => ({
        id: openCmdId(s.id), title: `${s.title} 열기`, icon: s.scroll ? 'layers' : 'dot',
    })),
];

/**
 * 활성(선택) — 선언 안 되는 것만 남는다: 상태바 open-count 를 먹이는 작업대 구독, 그리고 조건부 노드 배선.
 *   🔴 ⛔ 여기서 탭을 열지 않는다(열기는 리본·명령이). 등록(뷰·명령·리본·설정·상태바 open-count)은 contributes 가 끝냈다.
 */
function onActivate(host: PluginHost): void {
    // ── 상태바 open-count 는 contributes 가 꽂았다. 여기선 그 수를 세는 구독만 — 열린 시험 뷰(샘플) 수 ──
    const openSamples = new Set<string>();
    const isSample = (viewId?: string) => !!viewId && viewId.startsWith('pane-test.') && viewId !== CONSOLE_ID;
    host.workspace.on('open', (l) => { if (isSample(l.viewId)) { openSamples.add(l.id); setOpenViewCount(openSamples.size); } });
    host.workspace.on('close', (l) => { if (openSamples.delete(l.id)) setOpenViewCount(openSamples.size); });

    // ── 🔴 N4: 탐색기에 노드 수를 비추는 첫 소비자(🙋 6) — 탐색기가 있을 때만이라 선언이 아니다(host.declare 로 급조) ──
    wireNodes(host);
}

/**
 * 탐색기 노드 시스템을 쓰는 첫 소비자(N4) — 지금은 「노드 N」 셈 하나만 증명한다.
 *   🔴 탐색기가 없거나 꺼졌으면(없음) 조용히 건너뛴다 — 그게 결합을 host 하나로 가둔 결과다.
 *   🔴 node-count 상태바는 조건부라 contributes 가 아니라 host.declare 로 — 이름(render:'NodeCount')으로 renders 에서 구현을 찾는다.
 *      Disposable 은 host 가 주인(pluginId)별로 모아 끌 때 회수한다. subscribe 도 같은 길.
 */
function wireNodes(host: PluginHost): void {
    const nodes = host.modules.use<NodesApi>('nodes');
    if (!nodes) return;   // nodes 제공자가 없다(supports 라 null) — 노드 기능은 그냥 없다

    // 「노드 N」 — subscribe 로 센다(상태바가 비춘다). 처음 한 번 + 바뀔 때마다.
    const recount = () => setNodeCount(nodes.find(() => true).length);
    recount();
    nodes.subscribe(recount);
    host.declare({ kind: 'statusBar', id: 'node-count', side: 'left', render: 'NodeCount' });
}

export const paneTestPlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 M0 — nodes 는 「있으면 쓰는」 것(supports) — 없어도 하네스는 돈다(use('nodes') 가 null 이면 노드 셈만 빠진다).
        supports: { nodes: '^0.1' },
        contributes: {
            views: viewDefs,
            commands: commandDefs,
            ribbon: [{ commandId: OPEN_CMD, icon: 'flask', order: 0 }],
            settings: {
                sections: [{ id: 'pane-test', title: 'Pane UI Test', icon: 'flask' }],
                items: [{ section: 'pane-test', id: 'pane-test', title: '하네스', icon: 'flask', pane: 'Settings' }],
            },
            statusBar: [{ id: 'open-count', side: 'left', render: 'OpenCount' }],
        },
    },
    components,
    commands,
    panes,
    renders,
    lifecycle: { onActivate },
});
export default paneTestPlugin;
