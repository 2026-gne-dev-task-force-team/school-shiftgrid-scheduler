/**
 * 「속성」 신분증 — 고른 대상의 속성을 옆 패널에 보이는 자리(쥔님 2026-11-09).
 *   ⭐ 자리만 쥔다 — 무엇을 그릴지는 그 대상을 가진 플러그인이 contributes.properties 로 낸다.
 *   코어(후라이팬 기본 기능 — 끌 수 없다). id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../plugin';

export const manifest: PluginManifest = {
    id: 'properties',
    name: '속성',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'platform',
    core: true,
    description: '고른 것의 속성을 옆 패널에 보여 줍니다.',
    about: {
        what: '무언가를 고르면 그것의 속성을 옆 패널에 보여 줍니다. 무엇이 보일지는 그것을 만든 기능이 정합니다.',
        use: [
            '고른 것의 자세한 내용을 화면을 옮기지 않고 보고 싶을 때',
        ],
        off: '후라이팬 기본 기능이라 끌 수 없습니다.',
        with: '각 기능이 낸 속성 화면을 모아 보여 줍니다.',
    },
};
