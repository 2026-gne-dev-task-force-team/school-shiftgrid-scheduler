/** 스케줄러 플러그인 신분증 — 🔴 코어다(끌 수 없다 · 먼저 산다. 그뿐이다). id 는 폴더명과 같다(구조 검사 ⑧). */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'scheduler',
    name: '스케줄러',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    core: true,
    description: '빈 주간 캘린더 — 시간 축 · 카드 · 반복 기본(P4)',
};
