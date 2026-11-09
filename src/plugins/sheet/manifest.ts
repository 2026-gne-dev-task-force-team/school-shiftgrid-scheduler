/**
 * 제공자 플러그인 「sheet」 신분증 — table 약속을 채운다(provides·뷰·명령은 index 에서). id 는 폴더명과 같다(구조 검사 ⑧).
 *   코어 아님 — 설정 「플러그인」에서 끌 수 있다. 이미 PLUGINS 에 등록돼 있다(db9eda7).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

// satisfies 로 둬서 contributes 키가 추론 타입에 안 생긴다(provides·contributes 는 index 에서 더한다).
export const manifest = {
    id: 'sheet',
    name: '시트',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'platform',
    description: '엑셀·한글처럼 표를 그리는 공용 도구입니다.',
    about: {
        what: '엑셀·한글처럼 칸에 값을 적고, 줄을 넣고 빼고, 칸을 합치는 표 도구입니다. 시간표 같은 다른 기능이 표를 그릴 때 이 도구를 속에서 씁니다. ‘표 연습장’ 화면에서 직접 표를 만져 볼 수도 있습니다.',
        use: [
            '표가 어떻게 움직이는지 ‘표 연습장’에서 바로 만져 보고 싶을 때',
            '표가 필요한 다른 기능을 쓸 때, 그 기능이 자동으로 이 도구를 불러 씁니다.',
        ],
        off: '‘표 연습장’ 화면이 사라지고, 이 도구로 표를 그리는 다른 기능이 표를 못 그리게 될 수 있습니다.',
    },
} satisfies PluginManifest;
