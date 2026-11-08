/**
 * 약속 플러그인 「contract-roster」 신분증 — 약속 1장(roster). ⛔ 코어 아님(학교 약속은 쓸 때만 박는다 · 필요 없으면 뺀다).
 *   id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-roster',
    name: '약속: 명부',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '명부 약속(roster 0.1) — 사람·반·과목·특별실. 타입만(모듈 0·화면 0). 제공자: school-roster(M1).',
};
