/**
 * 설정 플러그인 신분증 — 🔴 코어다(core:true): 끌 수 없다 · 먼저 산다. 그뿐이다.
 *   ⭐ 「설정을 꺼서 설정을 못 켜는」 일을 코어 잠금이 막는다(노트 🙋1).
 *   설정 화면이 「플러그인」 항목을 자기 섹션에 꽂으므로, 설정 기여점을 자기 몸으로 증명한다.
 */
import type { PluginManifest } from '../../plugin';

export const manifest: PluginManifest = {
    id: 'settings',
    name: '설정',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'platform',
    core: true,
    description: '앱의 설정을 모아 둔 화면입니다.',
    about: {
        what: '화면 색과 글자 크기, 화면 틀, 그리고 어떤 기능을 켜고 끌지를 한곳에서 정합니다.',
        use: [
            '화면을 밝게·어둡게 바꾸거나 글자 크기를 조절할 때',
            '쓰지 않는 기능을 끄거나 다시 켤 때',
            '위쪽 단추 줄(리본)에 어떤 단추를 둘지 고를 때',
        ],
        off: '앱의 기본 기능이라 끌 수 없습니다. 설정을 꺼 버리면 다시 켤 곳이 없어지기 때문입니다.',
    },
};
