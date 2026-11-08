/**
 * 약속 플러그인 「contract-timetable」 신분증 — 약속 1장(timetable). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-timetable',
    name: '약속: 시간표',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '확정 시간표 약속(timetable 0.1) — 기본 주간 + 날짜별 바뀜. 타입만. clock 에 기댄다(uses). 제공자: timetable-store(M1).',
};
