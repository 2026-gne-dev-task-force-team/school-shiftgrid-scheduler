/**
 * 약속 플러그인 「contract-week-grid」 신분증 — 약속 1장(week-grid). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-week-grid',
    name: '약속: 주 격자',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '주 격자 약속(week-grid 0.1) — 요일×교시 격자·칸 열쇠. 타입만. clock 에 기댄다(uses). 제공자: school-clock(M1).',
};
