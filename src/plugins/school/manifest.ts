/**
 * 「학교 정보」 신분증 — 학교 하나 + 학년도(반 목록). ⛔ 과목·담임·나이스 가져오기는 1차 범위 밖. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'school',
    name: '학교 정보',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'home',
    description: '학교 하나와 학년도별 반 목록을 담습니다.',
    about: {
        what: '학교(이름·학교급·메모와 자유 글)를 하나 만들고, 학년도마다 반(학년·반·교실·도움반·메모)을 적어 둡니다. 학교를 먼저 만들어야 학년도를 만들 수 있습니다.',
        use: [
            '우리 학교의 반 구성을 학년도별로 정리할 때',
            '반마다 쓰는 교실을 방 목록과 이어 둘 때',
        ],
        off: '학교 화면이 사라집니다. 저장해 둔 학교·학년도는 지워지지 않고, 다시 켜면 그대로 보입니다.',
        with: '학교·학년도는 탐색기 나무에 담깁니다. 교실 칸은 방 목록 플러그인의 방을 고릅니다.',
    },
};
