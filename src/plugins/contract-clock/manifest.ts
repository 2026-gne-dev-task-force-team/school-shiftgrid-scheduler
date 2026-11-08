/**
 * 약속 플러그인 「contract-clock」 신분증 — 약속 1장(clock). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-clock',
    name: '약속: 시각',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '시각 약속(clock 0.1) — 교시↔시각·급식 교대·하교 + 학교 시각 낱말. 타입만. 제공자: school-clock(M1).',
};
