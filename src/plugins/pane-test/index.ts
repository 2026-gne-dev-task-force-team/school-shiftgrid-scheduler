/**
 * 「팬 UI 엔진 테스트」 플러그인 — 창틀을 눈으로 시험하는 하네스(쥔님 2026-11-01).
 *   쥔님: *"리본에 데모 아이콘 하나 눌리면, 데모 탭 하나 열리고, 거기 안에서 다양한 레이아웃 테스트"* ·
 *         *"패널 ABCD 탭 가나다라, 테스트해 볼 수 있는 여러 창 타입 에뮬레이트"* ·
 *         *"생성하기 버튼은 아무 데서나 만들지 말고"*(→ 생성 단추는 시험 탭 안에만).
 *
 * ⭐ 플러그인 API 를 한 칸씩 쓰는 증명도 겸한다 — 뷰·리본·명령·상태바·설정 섹션·이벤트 구독.
 *    ⚠️ host-api.test.ts 와 중복으로 또 테스트를 만들지 않는다(거긴 그대로 둔다) — 여기선 실동작으로 쓴다.
 * 🔴 ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다(리본 아이콘을 눌러야 열린다).
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost, ViewProps } from '../../pane-ui-system/plugin';
// 🔴 N4 — 다른 플러그인의 「타입만」 import(import type). 값은 host.plugins.get 으로만 받는다(구조 검사 ⑨ 예외 🙋 4).
import type { NodesApi } from '../project-explorer/api';
import { manifest } from './manifest';
import { TestConsole } from './views/TestConsole';
import { SampleView } from './views/SampleView';
import { PaneTestSettings } from './settings/PaneTestSettings';
import { OpenCountStatus } from './components/OpenCountStatus';
import { NodeCountStatus } from './components/NodeCountStatus';
import { setOpenViewCount, setNodeCount, openCmdId } from './store';

const CONSOLE_ID = 'pane-test.console';

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

function activate(host: PluginHost): void {
    // ── 뷰: 시험 탭(싱글턴·가운데·안 가름) ──
    //    🔴 p.peek 을 넘긴다 — 피크는 이 탭 안에서 뜬다(전역 창 아님).
    host.views.register({
        id: 'console', title: 'Pane UI Test', icon: 'flask', defaultArea: 'center',
        placement: { areas: ['center'], split: false, singleton: true },
        layout: { minWidth: 240, squeeze: 'scroll' },
        Component: (p: ViewProps) => createElement(TestConsole, { host, peek: p.peek }),
    });

    // ── 뷰: 시험용 샘플들(패널 A~D · 탭 가~라 · 스크롤) — 자유 배치, 여러 장 열려 레이아웃 시험 ──
    for (const s of SAMPLES) {
        host.views.register({
            id: s.id, title: s.title, icon: 'dot', defaultArea: 'center',
            layout: s.scroll ? { minWidth: 160, squeeze: 'scroll' } : { minWidth: 140 },
            Component: (p: ViewProps) => createElement(SampleView, { title: s.title, tone: s.tone, scroll: s.scroll, p }),
        });
    }

    // ── 명령 + 리본 아이콘 하나 — 누르면 시험 탭을 연다(싱글턴이라 두 장 안 열린다) ──
    host.commands.add({
        id: 'pane-test.open', title: 'Pane UI Test 열기', icon: 'flask',
        run: () => { host.workspace.open(CONSOLE_ID, { where: 'center' }); },
    });
    host.ribbon.add({ commandId: 'pane-test.open', icon: 'flask', order: 0 });

    // ── 🔴 시험 뷰 열기도 전부 명령으로 — 콘솔 단추·팔레트가 같은 id 로 부른다(「모든 동작은 명령」) ──
    for (const s of SAMPLES) {
        host.commands.add({
            id: openCmdId(s.id), title: `${s.title} 열기`, icon: s.scroll ? 'layers' : 'dot',
            run: () => { host.workspace.open(`pane-test.${s.id}`, { where: s.where }); },
        });
    }

    // ── 설정 섹션 — 하네스 설명 + 피크 넓음/좁음 가름 폭(설정으로 뺀 값) ──
    host.settings.addSection('pane-test', 'Pane UI Test', 'flask');
    host.settings.addItem({ section: 'pane-test', id: 'pane-test', title: '하네스', icon: 'flask', Pane: () => createElement(PaneTestSettings, { host }) });

    // ── 상태바 + 이벤트 구독 — 열린 시험 뷰(샘플) 수를 센다 ──
    const openSamples = new Set<string>();
    const isSample = (viewId?: string) => !!viewId && viewId.startsWith('pane-test.') && viewId !== CONSOLE_ID;
    host.workspace.on('open', (l) => { if (isSample(l.viewId)) { openSamples.add(l.id); setOpenViewCount(openSamples.size); } });
    host.workspace.on('close', (l) => { if (openSamples.delete(l.id)) setOpenViewCount(openSamples.size); });
    host.statusBar.add({ id: 'open-count', side: 'left', render: () => createElement(OpenCountStatus) });

    // ── 🔴 N4: 탐색기에 노드 타입을 꽂는 첫 소비자(🙋 6) ──
    //    코어라 늘 살아 있지만, 못 받으면(없음) 조용히 건너뛴다 — 그게 결합을 host 하나로 가둔 결과다.
    wireNodes(host);
}

/**
 * 탐색기 노드 시스템을 쓰는 첫 소비자(N4) — 지금은 「노드 N」 셈 하나만 증명한다.
 *   🔴 샘플·유도 폴더 데모 타입은 걷어냈다(쥔님 2026-11-01 19:34: *"아직 요청 안 했으니 없애줘"*) —
 *      첫 실행 탐색기에 「새 샘플 / 새 유도 폴더」가 뜨고 유도(안내) 가짜 자식이 보이던 것.
 *   🔴 등록은 nodes 가 돌려준 Disposable 로 빠진다(host 가 호출자 소유로 회수) — subscribe 도 같은 길.
 */
function wireNodes(host: PluginHost): void {
    const nodes = host.plugins.get<NodesApi>('project-explorer');
    if (!nodes) return;   // 탐색기가 없거나 꺼졌다 — 노드 기능은 그냥 없다

    // 「노드 N」 — subscribe 로 센다(상태바가 비춘다). 처음 한 번 + 바뀔 때마다.
    const recount = () => setNodeCount(nodes.find(() => true).length);
    recount();
    nodes.subscribe(recount);
    host.statusBar.add({ id: 'node-count', side: 'left', render: () => createElement(NodeCountStatus) });
}

export const paneTestPlugin: PluginModule = { manifest, activate };
export default paneTestPlugin;
