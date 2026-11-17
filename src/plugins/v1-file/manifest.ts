/**
 * 「v1 파일 호환」 신분증 — 경계 조각(1.2v 편성기 분해 F10 · 설계 3-4 · 요청함 R126).
 *   ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 *   F10a: 불러오기 순수 함수(./import-v1) — v1 Doc 을 정본마다 쓰기 목록으로 쪼갠다. 내보내기·왕복은 F10b.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'v1-file',
    name: 'v1 파일 호환',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'file',
    description: '예전 시간표 앱(v1)의 작업 파일을 열어 교직원·반·과목·시수표 등으로 나눠 넣습니다.',
    about: {
        what: '예전 시간표 앱(v1)에서 쓰던 작업 파일(.shiftgrid.json)을 열어, 교직원·학교·과목·특별실·일과표·복무·시수표·편성 막힘으로 나눠 넣습니다.',
        use: [
            '다른 선생님이 예전 앱으로 만든 시간표 파일을 받아 이어서 쓸 때',
        ],
        off: '예전 앱 파일을 열 수 없게 됩니다. 이미 넣은 자료는 그대로 남습니다.',
        with: '교직원·학교·과목·특별실·일과표·복무·시수표에 나눠 넣습니다.',
    },
};
