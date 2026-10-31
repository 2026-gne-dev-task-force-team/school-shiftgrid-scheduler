/**
 * 설정 메뉴 레지스트리.
 *
 * 🔴 ⭐ 새 설정 항목을 더하는 비용은 "파일 하나 + 여기 한 줄" 이어야 한다.
 *    쥔님이 가장 경계하신 것: *"설정 때려박으면 오만 거 다 때려박더라"*.
 *    ⛔ 한 파일에 전부 쓰지 말 것 · ⛔ 지금은 「모양」 하나뿐 — 빈 메뉴를 미리 늘어놓지 않는다.
 *
 * 더하는 법:
 *   1) panes/<이름>Pane.tsx 를 만든다 (SettingsPaneProps 를 받는 컴포넌트)
 *   2) 아래 SETTINGS_MENUS 에 { id, title, icon, Pane } 한 줄을 넣는다
 */
import type { ComponentType } from 'react';
import type { IconName } from '../../ui-system';
import type { ThemeControls } from '../../ui-system';
import { AppearancePane } from './panes/AppearancePane';

/** 각 설정 Pane 이 받는 것 — 지금은 테마 제어뿐. 늘어나면 여기에 담는다 */
export interface SettingsPaneProps {
    theme: ThemeControls;
}

export interface SettingsMenu {
    id: string;
    title: string;
    icon: IconName;
    Pane: ComponentType<SettingsPaneProps>;
}

export const SETTINGS_MENUS: SettingsMenu[] = [
    { id: 'appearance', title: '모양', icon: 'sun', Pane: AppearancePane },
    // ⬜ 다음 메뉴는 여기 한 줄 — ⛔ 지금 미리 늘어놓지 않는다
];
