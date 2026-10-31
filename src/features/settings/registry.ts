/**
 * 설정 메뉴 레지스트리 — 🔴 유형별로 섹션(카테고리)으로 묶는다(쥔님 2026-11-01:
 *    *"설정창이 너무 복잡해. 코드로 받기는 하는데 유형별로 조금 나눠 놔야."*).
 *
 * 🔴 ⭐ 새 설정 항목을 더하는 비용은 "파일 하나 + 여기 한 줄" 이어야 한다.
 *    쥔님이 가장 경계하신 것: *"설정 때려박으면 오만 거 다 때려박더라"*.
 *    ⛔ 한 파일에 전부 쓰지 말 것 · ⛔ 빈 섹션·항목을 미리 늘어놓지 않는다.
 *
 * 더하는 법:
 *   1) panes/<이름>Pane.tsx 를 만든다 (SettingsPaneProps 를 받는 컴포넌트)
 *   2) 아래 알맞은 섹션의 items 에 { id, title, icon, Pane } 한 줄을 넣는다(없는 섹션이면 섹션 한 줄)
 *
 * 섹션은 셋이다 — 「모양」(테마·밀도) / 「창틀」(패널 폭·탭·좁은 화면) / 「뷰」(등록된 뷰의 힌트 덮어쓰기).
 */
import type { ComponentType } from 'react';
import type { IconName } from '../../pane-ui-system';
import type { ThemeControls } from '../../pane-ui-system';
import { AppearancePane } from './panes/AppearancePane';
import { PaneSettingsPane } from './panes/PaneSettingsPane';
import { ViewSettingsPane } from './panes/ViewSettingsPane';

/** 각 설정 Pane 이 받는 것 — 지금은 테마 제어뿐(창틀·뷰 Pane 은 자체 스토어를 쓴다). 늘어나면 여기에 담는다 */
export interface SettingsPaneProps {
    theme: ThemeControls;
}

export interface SettingsItem {
    id: string;
    title: string;
    icon: IconName;
    Pane: ComponentType<SettingsPaneProps>;
}

export interface SettingsSection {
    id: string;
    title: string;
    items: SettingsItem[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
    { id: 'appearance', title: '모양', items: [
        { id: 'theme', title: '테마·밀도', icon: 'sun', Pane: AppearancePane },
    ] },
    { id: 'frame', title: '창틀', items: [
        { id: 'pane', title: '패널', icon: 'panelLeft', Pane: PaneSettingsPane },
    ] },
    { id: 'views', title: '뷰', items: [
        { id: 'views', title: '등록된 뷰', icon: 'layers', Pane: ViewSettingsPane },
    ] },
];

/** 섹션을 편 평평한 항목 목록 — 고른 항목을 id 로 찾을 때 쓴다 */
export const SETTINGS_ITEMS: SettingsItem[] = SETTINGS_SECTIONS.flatMap((s) => s.items);
