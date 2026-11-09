/**
 * 「선택 알림」 신분증 — 지금 무엇이 골라졌나를 다른 기능에 알리는 자리(쥔님 2026-11-09 「알림 플러그인은 따로」).
 *   ⛔ 화면 없음 · 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'selection',
    name: '선택 알림',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'platform',
    description: '지금 고른 것을 다른 기능에 알려 줍니다.',
    about: {
        what: '탐색기 등에서 무언가를 고르면, 그것이 무엇인지 다른 기능(속성 패널 등)에 알려 줍니다. 화면은 없습니다.',
        use: ['고른 것의 속성을 옆 패널에서 보고 싶을 때'],
        off: '속성 패널이 고른 것을 따라가지 않습니다. 지워지는 내용은 없습니다.',
        with: '탐색기가 알리고, 속성 패널이 듣습니다.',
    },
};
