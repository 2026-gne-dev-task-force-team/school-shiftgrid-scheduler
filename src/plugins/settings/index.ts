/**
 * 설정 플러그인 — 코어. activate 안에서:
 *   ① 설정 섹션·항목을 host.settings 로 꽂는다(모양·창틀·뷰·리본) — 설정 기여점을 자기 몸으로 증명한다.
 *   ② 설정 화면 뷰 하나(settings.main)를 꽂는다.
 *   ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다.
 *
 * 🔴 뷰·리본 Pane 은 이 플러그인의 host(뷰 목록·리본 조회 창구)를 클로저로 받는다.
 *    모양 Pane 은 테마를 스스로 쥐고(useTheme), 패널 Pane 은 아무것도 안 받는다 — 각자 자족.
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost, ViewProps } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { SettingsScreen } from './SettingsScreen';
import { AppearancePane } from './panes/AppearancePane';
import { PaneSettingsPane } from './panes/PaneSettingsPane';
import { RibbonSettingsPane } from './panes/RibbonSettingsPane';
import { ViewSettingsPane } from './panes/ViewSettingsPane';

function activate(host: PluginHost): void {
    // ── 설정 섹션·항목 — 유형별로(쥔님: 모양/창틀/뷰) ──
    host.settings.addSection('appearance', '모양', 'sun');
    host.settings.addItem({ section: 'appearance', id: 'theme', title: '테마·밀도', icon: 'sun', Pane: AppearancePane });

    host.settings.addSection('frame', '창틀', 'panelLeft');
    host.settings.addItem({ section: 'frame', id: 'pane', title: '패널', icon: 'panelLeft', Pane: PaneSettingsPane });
    host.settings.addItem({
        section: 'frame', id: 'ribbon', title: '리본', icon: 'menu',
        Pane: () => createElement(RibbonSettingsPane, { host }),
    });

    host.settings.addSection('views', '뷰', 'layers');
    host.settings.addItem({
        section: 'views', id: 'views', title: '등록된 뷰', icon: 'layers',
        Pane: () => createElement(ViewSettingsPane, { host }),
    });

    // ── 설정 화면 뷰 — 한 번에 하나(singleton) ──
    host.views.register({
        id: 'main', title: '설정', icon: 'gear', defaultArea: 'center',
        singleton: true,
        layout: { minWidth: 320, squeeze: 'collapse', collapseBelow: 480 },
        Component: (p: ViewProps) => createElement(SettingsScreen, { collapsed: p.collapsed }),
    });
}

export const settingsPlugin: PluginModule = { manifest, activate };
export default settingsPlugin;
