/**
 * 「자동 편성 엔진」 신분증 — 화면 없는 엔진 조각(1.2v 편성기 분해 F1 · 요청함 R126).
 *   ⛔ 코어 아님 — 설정 「플러그인」에서 끌 수 있다. id 는 폴더명과 같다(구조 검사 ⑧).
 *   엔진 실체는 ./engine(v1 legacy/engine 에서 꼴만 옮김) · 약속은 ./contracts/solver.ts.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'timetable-solver',
    name: '자동 편성 엔진',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'schedule',
    description: '시간표를 자동으로 짜 주는 엔진입니다. 화면은 없고 편성 화면이 부릅니다.',
    about: {
        what: '시간표를 자동으로 짜 주는 엔진입니다. 화면은 따로 없고, 편성 화면이 이 엔진을 불러 시간표를 짜고, 겹침을 찾고, 수업을 옮겨도 되는지 판단합니다.',
        use: [
            '편성 화면에서 「자동 편성」으로 시간표를 짤 때',
            '수업을 옮기기 전에 겹치는 곳이 없는지 미리 볼 때',
        ],
        off: '자동 편성과 겹침 점검을 쓸 수 없게 됩니다. 저장해 둔 시간표는 지워지지 않고, 다시 켜면 그대로 쓸 수 있습니다.',
        with: '편성 화면이 이 엔진을 불러 씁니다.',
    },
};
