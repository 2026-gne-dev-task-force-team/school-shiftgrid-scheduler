/**
 * 약속 플러그인 「contract-permit」 신분증 — 약속 1장(permit). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-permit',
    name: '약속: 판정',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '판정 약속(permit 0.1) — 이걸 해도 되나(화면 가리기 · 마스터면 늘 true). 타입만. 제공자: account → account-server(나중).',
};
