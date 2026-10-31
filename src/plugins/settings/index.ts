/**
 * 설정 플러그인 — 코어. activate 안에서 설정 화면 뷰 하나(settings.main)를 꽂는다.
 *   ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다.
 *
 * 📌 커밋 A(코어화): 설정 화면은 아직 SETTINGS_SECTIONS 상수를 읽는다.
 *    커밋 B(P1)에서 이 activate 가 모양·창틀·뷰·리본 판을 host.settings 로 꽂게 바뀐다.
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost, ViewProps } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { SettingsScreen } from './SettingsScreen';

function activate(host: PluginHost): void {
    // 설정 화면 — 한 번에 하나(singleton). host 를 클로저로 넘긴다(뷰는 props 로 host 를 받지 않는다).
    host.views.register({
        id: 'main', title: '설정', icon: 'gear', defaultArea: 'center',
        singleton: true,
        layout: { minWidth: 320, squeeze: 'collapse', collapseBelow: 480 },
        Component: (p: ViewProps) => createElement(SettingsScreen, { host, collapsed: p.collapsed }),
    });
}

export const settingsPlugin: PluginModule = { manifest, activate };
export default settingsPlugin;
