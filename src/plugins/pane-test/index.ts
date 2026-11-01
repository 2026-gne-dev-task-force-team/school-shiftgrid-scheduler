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
import { manifest } from './manifest';
import { TestConsole } from './views/TestConsole';
import { SampleView } from './views/SampleView';
import { PaneTestSettings } from './settings/PaneTestSettings';
import { OpenCountStatus } from './components/OpenCountStatus';
import { setOpenViewCount } from './store';

const CONSOLE_ID = 'pane-test.console';

/** 시험 뷰 목록 — 각자 다른 색(tone)·이름. 전부 자유 배치(끌어 가르기·사이드바로 옮겨 시험). */
const SAMPLES: { id: string; title: string; tone: number; scroll?: boolean }[] = [
    { id: 'panel-a', title: '패널 A', tone: 0 },
    { id: 'panel-b', title: '패널 B', tone: 1 },
    { id: 'panel-c', title: '패널 C', tone: 2 },
    { id: 'panel-d', title: '패널 D', tone: 3 },
    { id: 'tab-ga', title: '탭 가', tone: 4 },
    { id: 'tab-na', title: '탭 나', tone: 5 },
    { id: 'tab-da', title: '탭 다', tone: 6 },
    { id: 'tab-ra', title: '탭 라', tone: 7 },
    { id: 'scroll', title: '스크롤 시험', tone: 8, scroll: true },
];

function activate(host: PluginHost): void {
    // ── 뷰: 시험 탭(싱글턴·가운데·안 가름) ──
    host.views.register({
        id: 'console', title: '팬 UI 엔진 테스트', icon: 'sparkles', defaultArea: 'center',
        placement: { areas: ['center'], split: false, singleton: true },
        layout: { minWidth: 240, squeeze: 'scroll' },
        Component: () => createElement(TestConsole, { host }),
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
        id: 'pane-test.open', title: '팬 UI 엔진 테스트 열기', icon: 'sparkles',
        run: () => { host.workspace.open(CONSOLE_ID, { where: 'center' }); },
    });
    host.ribbon.add({ commandId: 'pane-test.open', icon: 'sparkles', order: 0 });

    // ── 설정 섹션 — 하네스 설명(단계 4 에서 피크 가름 폭이 여기 붙는다) ──
    host.settings.addSection('pane-test', '팬 UI 엔진 테스트', 'sparkles');
    host.settings.addItem({ section: 'pane-test', id: 'pane-test', title: '하네스', icon: 'sparkles', Pane: PaneTestSettings });

    // ── 상태바 + 이벤트 구독 — 열린 시험 뷰(샘플) 수를 센다 ──
    const openSamples = new Set<string>();
    const isSample = (viewId?: string) => !!viewId && viewId.startsWith('pane-test.') && viewId !== CONSOLE_ID;
    host.workspace.on('open', (l) => { if (isSample(l.viewId)) { openSamples.add(l.id); setOpenViewCount(openSamples.size); } });
    host.workspace.on('close', (l) => { if (openSamples.delete(l.id)) setOpenViewCount(openSamples.size); });
    host.statusBar.add({ id: 'open-count', side: 'left', render: () => createElement(OpenCountStatus) });
}

export const paneTestPlugin: PluginModule = { manifest, activate };
export default paneTestPlugin;
