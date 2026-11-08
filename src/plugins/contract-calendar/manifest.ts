/**
 * 약속 플러그인 「contract-calendar」 신분증 — 약속 1장(calendar). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-calendar',
    name: '약속: 달력',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '달력 뷰 빌려주기 약속(calendar 0.1) — 남의 일정을 「출처」로 넣으면 달력이 받은 대로 그린다. 타입만. 제공자: calendar(달력 플러그인).',
};
