/**
 * 약속 플러그인 「contract-people」 신분증 — 약속 1장(people). ⛔ 코어 아님(쓸 때만 박는다 · 필요 없으면 뺀다).
 *   id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-people',
    name: '약속: 사람 명단',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '사람 명단 약속(people 0.1) — 명단과 사람. 학교·계정 모름. 타입만(모듈 0·화면 0). 제공자: people.',
};
