/**
 * 🍳 후라이팬 코어 — 「끌 수 없는 기본 기능」이 사는 폴더(내부 코어 플러그인: 지금 꼴 그대로 manifest.ts + index.ts(definePlugin) · core: true · layer 'platform').
 *
 * 📌 모듈 지도(이사 중 — 판마다 한 줄씩 더한다):
 *   selection  선택 알림 — 지금 무엇이 골라졌나(화면 없음). 탐색기가 알리고 속성이 듣는다.
 *   properties  속성 패널 · icon-pack-basic  기본 아이콘 묶음
 *   (이사 예정) explorer(→ nodes·node-store·node-frame·explorer) · settings(→ settings·plugin-manager)
 *
 * ⛔ 규칙(구조 검사 ⑦b·⑥′·⑧′): core 는 app·plugins 를 import 하지 않는다 · plugins 는 core 를 `core/<m>/contracts/` 의 import type 으로만 부른다 ·
 *    엔진(core 밖 pane-ui-system)은 core 를 부르지 않는다 — 조립은 app/plugins.ts 가 `[...CORE_PLUGINS, …]` 로 한다.
 * ⚠️ 활성 순서 = 목록 순(core 먼저·같은 층은 설치 순). 이사한 모듈을 여기 한 줄 더할 때 골든(activation.golden.test)의 순서가 안 바뀌게 놓는다.
 */
import type { PluginModule } from '../plugin';
import { selectionPlugin } from './selection';
import { propertiesPlugin } from './properties';
import { iconPackBasicPlugin } from './icon-pack-basic';

export const CORE_PLUGINS: PluginModule[] = [
    selectionPlugin,   // 선택 알림 꾸러미 — selection 약속(화면 없음)
    propertiesPlugin,  // 속성 꾸러미 — 오른쪽 「속성」 패널 · 칸은 대상 주인이 contributes.properties 로 낸다
    iconPackBasicPlugin, // 기본 아이콘 묶음 — 「커스텀」 탭 SVG 열두 개(아이콘 묶음 확장점의 본보기 · 다른 묶음 플러그인도 같은 확장점을 쓴다)
];
