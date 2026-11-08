/**
 * 약속 플러그인 「contract-absence」 신분증 — 약속 1장(absence). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-absence',
    name: '약속: 부재',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '복무·부재 약속(absence 0.1) — 출장·연수·병가·회의(매주 반복 포함). 타입만. clock 에 기댄다(uses). 제공자: absence(M1).',
};
