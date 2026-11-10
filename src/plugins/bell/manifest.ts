/**
 * 「일과표」 신분증 — 교시별 시각·점심·하교를 적고, 학년마다 다른 점심을 셈으로 푼다. ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'bell',
    name: '일과표',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'bell',
    description: '교시별 시작·끝 시각, 점심, 하교를 적습니다.',
    about: {
        what: '학교의 교시별 시작·끝 시각과 점심, 하교 시각을 적는 일과표입니다. 학년마다 점심이 달라 같은 「3교시」가 학년마다 다른 시각이어도, 실제 시각으로 겹치는지 셀 수 있습니다.',
        use: [
            '학년별 점심·하교 시각을 한 곳에 정리할 때',
            '보결·시간표에서 「이 두 수업이 같은 시각인가」를 따질 때',
        ],
        off: '일과표 화면이 사라지고 이 시각을 읽는 기능이 값을 못 받습니다. 적어 둔 일과표는 지워지지 않고, 다시 켜면 그대로 보입니다.',
        with: '만든 일과표는 탐색기 나무에 담깁니다.',
    },
};
