/**
 * 설정 플러그인 — 코어. 선언형(definePlugin + manifest.contributes):
 *   ① 설정 섹션·항목을 contributes.settings 로 적는다(모양·창틀·플러그인·정보) — 설정 기여점을 자기 몸으로 증명한다.
 *   ② 설정 화면 뷰 하나(settings.main)를 contributes.views 로 적는다.
 *   실행에 필요한 Pane·컴포넌트는 panes·components 로 이름 붙여 내놓고, 짝은 호스트가 맞춘다.
 *
 * 📌 2026-11-02 선언형 전환(D1): 옛 onActivate 안 host.settings.add* · host.views.register 호출을 전부 contributes 로 옮겼다.
 *    섹션·항목·순서·제목·화면은 전후 같다(applyContributes 는 섹션 전부→항목 전부 순으로 꽂지만,
 *    listSettings 가 seq 로 정렬해 섹션별로 묶으므로 최종 상대 순서가 옛 결과와 같다).
 *
 * 🔴 Pane·컴포넌트는 꽂을 때 호스트가 첫 prop 으로 host 를 끼워 넣는다(declareOne) — 안드로이드 Activity 의 Context 결.
 *    리본·플러그인 Pane 은 그 host(뷰 목록·리본 조회 창구)를 쓰고, 모양·패널·정보 Pane 은 안 쓴다(각자 자족).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { ViewProps } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { undoReset, resetUndoable } from './reset-undo';
import { SettingsScreen } from './SettingsScreen';
import { AppearancePane } from './panes/AppearancePane';
import { PaneSettingsPane } from './panes/PaneSettingsPane';
import { RibbonSettingsPane } from './panes/RibbonSettingsPane';
import { PluginsPane } from './panes/PluginsPane';
import { StartupPane } from './panes/StartupPane';
import { NotifyPane } from './panes/NotifyPane';
import { KeybindingsPane } from './panes/KeybindingsPane';
import { AboutPane } from './panes/AboutPane';

export const settingsPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            settings: {
                // 유형별로(쥔님: 모양/창틀/플러그인/정보) — 섹션 순서가 설정 화면 메뉴 순서다.
                sections: [
                    { id: 'appearance', title: '모양', icon: 'sun' },
                    { id: 'frame', title: '창틀', icon: 'panelLeft' },
                    { id: 'plugins', title: '플러그인', icon: 'puzzle' },
                    { id: 'about', title: '정보', icon: 'info' },
                ],
                items: [
                    { section: 'appearance', id: 'theme', title: '테마·밀도', icon: 'sun', pane: 'Appearance' },
                    { section: 'frame', id: 'pane', title: '패널', icon: 'panelLeft', pane: 'PaneSettings' },
                    { section: 'frame', id: 'ribbon', title: '리본', icon: 'menu', pane: 'Ribbon' },
                    { section: 'frame', id: 'startup', title: '시작 화면', icon: 'play', pane: 'Startup' },
                    { section: 'frame', id: 'notify', title: '알림', icon: 'bell', pane: 'Notify' },
                    // 단축키 — 명령마다 키 보기·바꾸기(쥔님 2026-11-09). 엔진은 창틀 keybindings.ts
                    { section: 'frame', id: 'keys', title: '단축키', icon: 'key', pane: 'Keybindings' },
                    // 📌 「뷰 › 등록된 뷰」 판은 2026-11-01 19:06 폐기 — 뷰 설정은 그 플러그인 상세(PluginDetail) 안으로 들어갔다(쥔님).
                    // 플러그인 관리 — 설치 목록·켜기/끄기(코어는 잠김) · 줄의 「자세히」로 상세가 피크로. 설정 기여점으로 수명주기를 조종한다
                    //   📌 2026-11-08 쥔님: 「약속(인터페이스)」 별도 항목을 없앴다 — 사용자가 따로 볼 이유가 없어, 그 정보(채우는/필요한/
                    //      있으면 쓰는/나를 쓰는 약속)는 플러그인 상세(PluginDetail) 안 「모듈·의존성」 한 요소로만 둔다(다른 칸처럼).
                    { section: 'plugins', id: 'plugins', title: '설치된 플러그인', icon: 'puzzle', pane: 'Plugins' },
                    // 이 프로그램 — 이름·판·창틀 판·플러그인 수(쥔님 13:14)
                    { section: 'about', id: 'about', title: '이 프로그램', icon: 'info', pane: 'About' },
                ],
            },
            commands: [{ id: 'settings.undoReset', title: '초기화 되돌리기', icon: 'undo', palette: false }],
            // ── 설정 화면 뷰 — 딱 한 장(singleton) · 가운데 탭에만 · 안 가른다 ──
            //    🔴 설정은 가운데 탭에만 산다 — 사이드바·가르기 금지(쥔님 13:43: "설정이 사이드바로 들어가기엔 무리").
            //    singleton 은 placement 의 한 축이다 — 이미 떠 있으면 새로 안 열고 그리로 간다.
            views: [{
                id: 'main', title: '설정', icon: 'gear', defaultArea: 'center',
                description: '모양·창틀·뷰·리본·플러그인 설정을 한 화면에서 — 2단 메뉴(좁아지면 아이콘·한 단계)',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 320, squeeze: 'collapse', collapseBelow: 480 },
                component: 'Main',
            }],
        },
    },
    commands: { 'settings.undoReset': (_host, ctx) => { undoReset(ctx); } },
    enabled: { 'settings.undoReset': (_host, ctx) => resetUndoable(ctx) },
    // 뷰 컴포넌트 — SettingsScreen 에 collapsed·peek 만 넘긴다(host 는 안 쓴다).
    components: {
        Main: (p: ViewProps) => createElement(SettingsScreen, { collapsed: p.collapsed, peek: p.peek }),
    },
    // 설정 Pane — 호스트가 첫 prop 으로 host 를 끼워 넣는다(모양·패널·정보 Pane 은 무시, 리본·플러그인 Pane 은 쓴다).
    panes: {
        Appearance: AppearancePane,
        PaneSettings: PaneSettingsPane,
        Ribbon: RibbonSettingsPane,
        Startup: StartupPane,
        Notify: NotifyPane,
        Keybindings: KeybindingsPane,
        Plugins: PluginsPane,
        About: AboutPane,
    },
});

export default settingsPlugin;
