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
    about: {
        what: '시간표 칸의 모양(기간·요일 열·교시 줄·칸)을 어떻게 적을지 정해 둔 약속입니다. 화면은 없습니다.',
        use: [
            '시간표 그리드를 쓸 때 함께 켜 둡니다',
        ],
        off: '이 약속을 쓰는 기능이 함께 꺼집니다. 저장된 자료는 지워지지 않습니다.',
        with: '시간표 그리드가 이 약속으로 칸을 그립니다. 시각 약속과 같이 씁니다.',
    },
};
