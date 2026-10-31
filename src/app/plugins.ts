/**
 * 설치된 플러그인 목록 — ⭐ 여기 한 줄이 「설치」다(정적 번들).
 *
 * 🔑 「나중에 갈아끼울 데」: 동적 로드(외부 .js)로 가도 바뀌는 파일은 이 한 장이다
 *    — activateAll 은 모듈이 어디서 왔는지 모른다.
 *
 * 🧪 플러그인 하나를 뺐다 넣었다: demoPlugin 줄을 주석 처리하면 리본이 비고
 *    저장된 탭은 「demo 꺼짐」 글자(EditorArea 자리표시)로 남는다 — 되돌리면 그 자리에서 돌아온다.
 */
import type { PluginModule } from '../pane-ui-system/plugin';
import { demoPlugin } from '../plugins/demo';

export const PLUGINS: PluginModule[] = [
    demoPlugin,
];
