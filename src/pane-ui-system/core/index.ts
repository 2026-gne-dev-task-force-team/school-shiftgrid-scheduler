/**
 * 🍳 후라이팬 코어 — 「끌 수 없는 기본 기능」이 사는 폴더(내부 코어 플러그인: 지금 꼴 그대로 manifest.ts + index.ts(definePlugin) · core: true · layer 'platform').
 *
 * 📌 모듈 지도(이사 중 — 판마다 한 줄씩 더한다):
 *   selection  선택 알림 — 지금 무엇이 골라졌나(화면 없음). 탐색기가 알리고 속성이 듣는다.
 *   nodes · node-store · node-frame  탐색기가 쓰는 부품 셋(플러그인 아님 — 약속·모델 / 보관·저장 / 틀·머리·끼움)
 *   explorer   탐색기 — 노드 하이라키 패널 + 신분증·활성(nodes 약속을 채운다)
 *   (이사 예정) properties · settings(→ settings·plugin-manager)
 *
 * 📌 도메인 누수 부채(이번에 고치지 않음): node-store/store.ts 에 FOCUS_ON_OPEN 의 'page.page'·'timetable-grid.sheet' 문자열이 있다.
 *
 * ⛔ 규칙(구조 검사 ⑦b·⑥′·⑧′): core 는 app·plugins 를 import 하지 않는다 · plugins 는 core 를 `core/<m>/contracts/` 의 import type 으로만 부른다 ·
 *    엔진(core 밖 pane-ui-system)은 core 를 부르지 않는다 — 조립은 app/plugins.ts 가 `[...CORE_PLUGINS, …]` 로 한다.
 * ⚠️ 활성 순서 = 목록 순(core 먼저·같은 층은 설치 순). 이사한 모듈을 여기 한 줄 더할 때 골든(activation.golden.test)의 순서가 안 바뀌게 놓는다.
 */
import type { PluginModule } from '../plugin';
import { explorerPlugin } from './explorer';
import { selectionPlugin } from './selection';

export const CORE_PLUGINS: PluginModule[] = [
    explorerPlugin,    // 탐색기 꾸러미 — 끌 수 없다. nodes 약속을 들고 와 채운다(provides) + 탐색기 패널. 골든 순서 settings → explorer → selection 유지
    selectionPlugin,   // 선택 알림 꾸러미 — selection 약속(화면 없음)
];
