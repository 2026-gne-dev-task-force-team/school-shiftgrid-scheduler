/**
 * 설정 플러그인 신분증 — 🔴 코어다(core:true): 끌 수 없다 · 먼저 산다. 그뿐이다.
 *   ⭐ 「설정을 꺼서 설정을 못 켜는」 일을 코어 잠금이 막는다(노트 🙋1).
 *   설정 화면이 「플러그인」 항목을 자기 섹션에 꽂으므로, 설정 기여점을 자기 몸으로 증명한다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'settings',
    name: '설정',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    core: true,
    description: '모양·창틀·뷰·리본·플러그인 — 앱 설정 화면',
};
