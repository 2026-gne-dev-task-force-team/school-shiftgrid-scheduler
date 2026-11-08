/**
 * 약속 플러그인 「contract-identity」 신분증 — 약속 1장(identity). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-identity',
    name: '약속: 계정',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '계정 약속(identity 0.1) — 지금 누구·권한. 타입만. 제공자: account-local(M1) → account-server(나중).',
};
