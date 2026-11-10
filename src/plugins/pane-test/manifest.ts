/**
 * 「팬 UI 엔진 테스트」 신분증 — 쥔님 2026-11-01: *"데모라고 하기보단 팬 UI 엔진 테스트. 이름 이렇게 하는 게 낫겠다"*.
 *   ⛔ 코어 아님 — 설정 「플러그인」에서 끌 수 있다(그 자체가 수명주기 시연이다). id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'pane-test',
    name: 'Pane UI Test',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    icon: 'flask',
    description: '창틀(pane-ui-system)을 눈으로 시험하는 하네스 — 패널·탭·스크롤·미리보기를 한 탭 안에서 연다',
    about: {
        what: '화면 틀(패널·탭·스크롤·미리보기)이 제대로 움직이는지 눈으로 확인하는 시험용 화면입니다.',
        use: [
            '화면 배치나 탭 동작이 이상할 때 확인해 볼 때',
        ],
        off: '시험 화면이 사라집니다. 다른 기능에는 영향이 없습니다.',
    },
};
