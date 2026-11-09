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
    about: {
        what: '확정된 시간표(기본 주간과 날짜별로 바뀐 것)를 어떻게 적을지 정해 둔 약속입니다. 화면은 없습니다.',
        use: [
            '시간표를 저장하거나 읽는 기능을 켤 때 함께 켜 둡니다',
        ],
        off: '이 약속을 쓰는 기능이 함께 꺼집니다. 저장된 자료는 지워지지 않습니다.',
        with: '시각 약속과 같이 씁니다.',
    },
};
