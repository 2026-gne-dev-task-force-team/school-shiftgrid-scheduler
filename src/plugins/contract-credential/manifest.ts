/**
 * 약속 플러그인 「contract-credential」 신분증 — 약속 1장(credential). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-credential',
    name: '약속: 증명',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '증명 약속(credential 0.1) — 그 사람이 맞나(입력 화면은 제공자가 띄움). 타입만. 제공자: credential-local → 누리집·구글(나중).',
};
