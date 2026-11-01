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
import { projectExplorerPlugin } from '../plugins/project-explorer';
import { paneTestPlugin } from '../plugins/pane-test';
import { calendarPlugin } from '../plugins/calendar';

// 🔴 코어(settings)는 core:true 라 activateAll 이 목록 순서와 무관하게 먼저 활성한다. ⛔ 설정 화면은 코어다 — 끌 수 없다.
//    pane-test(팬 UI 엔진 테스트)는 코어 아님 — 설정에서 끌 수 있다(그 자체가 수명주기 시연).
export const PLUGINS: PluginModule[] = [
    settingsPlugin,
    projectExplorerPlugin,   // 프로젝트 탐색기 — 코어(core:true), 끌 수 없다. 노드 하이라키 + 탐색기 패널(N1)
    paneTestPlugin,
    calendarPlugin,   // 캘린더(월 보기) — 코어 아님, 설정에서 끌 수 있다
];
