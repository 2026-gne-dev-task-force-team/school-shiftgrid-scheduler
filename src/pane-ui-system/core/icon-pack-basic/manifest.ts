/**
 * 「기본 아이콘 묶음」 신분증 — 제목 옆 아이콘 고르기 창의 「커스텀」 탭에 뜨는 예시 꾸러미(SVG 열두 개).
 *   코어(후라이팬 기본 기능 — 끌 수 없다, 쥔님 2026-11-10). id 는 폴더명과 같다(구조 검사 ⑧).
 *   커스텀 아이콘을 내는 꾸러미의 본보기다 — 다른 꾸러미도 contributes.iconPacks 한 칸만 적으면 같은 탭에 묶음으로 뜬다.
 */
import type { PluginManifest } from '../../plugin';

export const manifest = {
    id: 'icon-pack-basic',
    name: '기본 아이콘 묶음',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'platform',
    core: true,
    description: '제목 옆에 붙일 수 있는 선 그림 아이콘 열두 개를 더합니다.',
    about: {
        what: '페이지·표 같은 항목의 제목 옆에 붙일 수 있는 선 그림 아이콘 열두 개를 더합니다. 아이콘 고르기 창의 「커스텀」 탭에 나옵니다.',
        use: [
            '이모지보다 단정한 그림을 제목 옆에 두고 싶을 때',
            '아이콘 묶음을 내는 꾸러미를 만들 때 본보기로',
        ],
        off: '후라이팬 기본 기능이라 끌 수 없습니다.',
    },
} satisfies PluginManifest;
