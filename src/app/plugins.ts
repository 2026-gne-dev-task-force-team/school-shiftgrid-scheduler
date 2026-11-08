/**
 * 설치된 플러그인 목록 — ⭐ 여기 한 줄이 「설치」다(정적 번들).
 *
 * 🔑 「나중에 갈아끼울 데」: 동적 로드(외부 .js)로 가도 바뀌는 파일은 이 한 장이다
 *    — activateAll 은 모듈이 어디서 왔는지 모른다.
 *
 * 🧪 플러그인 하나를 뺐다 넣었다: 코어가 아닌 줄을 주석 처리하면 리본이 비고
 *    저장된 탭은 자리표시 글자(EditorArea)로 남는다 — 되돌리면 그 자리에서 돌아온다.
 */
import type { PluginModule } from '../pane-ui-system/plugin';
import { settingsPlugin } from '../plugins/settings';
import { contractNodesPlugin } from '../plugins/contract-nodes';
import { projectExplorerPlugin } from '../plugins/project-explorer';
import { calendarPlugin } from '../plugins/calendar';

/**
 * 🔴 3판(2026-11-08) — 약속(인터페이스)은 **약속 플러그인**(contract-*)이 contributes.interfaces 로 선언한다.
 *   옛 INTERFACES 고정 배열은 폐기했다(쥔님 *"여긴 범용 플랫폼 … 도메인 특화가 박히면 안 됨 … 필요 없을 땐 뺄 수 있어야"*).
 *   호스트가 켜진 플러그인들의 선언을 모아 약속 목록을 만든다 — 창틀·앱에 약속 이름이 고정으로 박히지 않는다.
 *   ⭐ nodes 는 범용 약속이라 contract-nodes(core)로 박는다. 학교 약속 일곱(contract-roster 등)은 소비자·제공자가
 *      생길 때 한 줄 추가한다 — 「필요 없는 건 안 박힌다」(지금은 PLUGINS 에 없다).
 */

// 🔴 코어(settings·contract-nodes)는 core:true 라 activateAll 이 목록 순서와 무관하게 먼저 활성한다. ⛔ 설정 화면은 코어다 — 끌 수 없다.
// 📌 2026-11-01 21:47 쥔님: *"Pane UI Test는 이제 등록해지하자, 코드에서는 안지우는데, 이제 쓸일이 없어서"* →
//    `paneTestPlugin` 을 이 목록에서 뺐다(앱이 더는 등록하지 않는다). ⛔ 코드·폴더(plugins/pane-test/)는 그대로 둔다 —
//    되살리려면 import 를 다시 걸고 아래 배열에 한 줄 더하면 된다. (N4 첫 소비자 증명이라 런타임에서만 사라진다 · 구조 검사 ⑧ 은 폴더를 본다)
export const PLUGINS: PluginModule[] = [
    settingsPlugin,
    contractNodesPlugin,     // 약속 「nodes」 — 코어(core:true). 제공자(탐색기)보다 먼저 서야 약속이 선다
    projectExplorerPlugin,   // 탐색기 — 코어(core:true), 끌 수 없다. nodes 약속을 채운다(provides) + 탐색기 패널(N1)
    calendarPlugin,   // 달력(월 보기) — 코어 아님, 설정에서 끌 수 있다. nodes 약속을 requires
];
