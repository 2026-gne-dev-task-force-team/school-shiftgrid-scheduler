/**
 * 약속 플러그인 「contract-week-grid」 신분증 — 약속 1장(week-grid). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-week-grid',
    name: '약속: 시간표 모양',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '시간표 모양 약속(week-grid 0.1) — 범위·열·행·칸 + 일정 목록(ScheduleEntry). 타입만. clock 에 기댄다(uses). 제공자: 시간표 그리드.',
};
