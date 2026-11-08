/**
 * 설치된 플러그인 목록 — ⭐ 여기 한 줄이 「설치」다(정적 번들).
 *
 * 🔑 「나중에 갈아끼울 데」: 동적 로드(외부 .js)로 가도 바뀌는 파일은 이 한 장이다
 *    — activateAll 은 모듈이 어디서 왔는지 모른다.
 *
 * 🧪 플러그인 하나를 뺐다 넣었다: 코어가 아닌 줄을 주석 처리하면 리본이 비고
 *    저장된 탭은 자리표시 글자(EditorArea)로 남는다 — 되돌리면 그 자리에서 돌아온다.
 */
import type { PluginModule, InterfaceDecl } from '../pane-ui-system/plugin';
import { settingsPlugin } from '../plugins/settings';
import { projectExplorerPlugin } from '../plugins/project-explorer';
import { calendarPlugin } from '../plugins/calendar';

/**
 * 🔴 M0 — 인터페이스 목록(이름·버전). 창틀은 src/interfaces 를 import 하지 않으니(구조 검사 ⑦) 앱이 데이터로 넘긴다.
 *   제공자가 0명이어도 인터페이스는 산다(설정 「인터페이스」 화면이 「채운 모듈 없음」으로 그린다). 지금은 nodes 하나.
 *   타입 한 장은 src/interfaces/nodes.ts(NodesApi 재export) — 값은 provides/modules 로만 온다.
 */
export const INTERFACES: InterfaceDecl[] = [
    { name: 'nodes', version: '0.1.0' },
    // ── 학교 인터페이스 일곱 장(M0.5 · 2026-11-08) — 타입은 src/interfaces/<이름>.ts · 제공자는 M1 레인이 채운다
    { name: 'roster', version: '0.1.0' },
    { name: 'clock', version: '0.1.0' },
    { name: 'week-grid', version: '0.1.0' },
    { name: 'timetable', version: '0.1.0' },
    { name: 'absence', version: '0.1.0' },
    { name: 'identity', version: '0.1.0' },
    { name: 'export', version: '0.1.0' },
];

// 🔴 코어(settings)는 core:true 라 activateAll 이 목록 순서와 무관하게 먼저 활성한다. ⛔ 설정 화면은 코어다 — 끌 수 없다.
// 📌 2026-11-01 21:47 쥔님: *"Pane UI Test는 이제 등록해지하자, 코드에서는 안지우는데, 이제 쓸일이 없어서"* →
//    `paneTestPlugin` 을 이 목록에서 뺐다(앱이 더는 등록하지 않는다). ⛔ 코드·폴더(plugins/pane-test/)는 그대로 둔다 —
//    되살리려면 import 를 다시 걸고 아래 배열에 한 줄 더하면 된다. (N4 첫 소비자 증명이라 런타임에서만 사라진다 · 구조 검사 ⑧ 은 폴더를 본다)
export const PLUGINS: PluginModule[] = [
    settingsPlugin,
    projectExplorerPlugin,   // 탐색기 — 코어(core:true), 끌 수 없다. 노드 하이라키 + 탐색기 패널(N1)
    calendarPlugin,   // 달력(월 보기) — 코어 아님, 설정에서 끌 수 있다
];
