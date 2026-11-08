/**
 * 약속 플러그인 「contract-nodes」 신분증 — 약속 1장(nodes) 1개(쥔님 2026-11-08 14:23 「약속도 꽂는다」).
 *   ⭐ core:true — 「범용이라도 쓸 약속이면 코어로 박는다」(쥔님). 유일한 제공자(project-explorer)가 **코어**라,
 *      이 약속을 끌 수 있게 두면 코어 탐색기를 「약속 없음」으로 막을 수 있어 모순이다(코어 = 끌 수 없다) → 코어로 고정.
 *      ⚠️ 「필요 없을 땐 뺄 수 있어야」는 학교 약속 일곱(contract-roster 등 · PLUGINS 에 안 박음)으로 지킨다 — nodes 는 지금 쓰는 약속이다.
 *   id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-nodes',
    name: '약속: 노드',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    core: true,
    description: '노드 하이라키 약속(nodes 0.1) — 타입만 선언한다(모듈 0·화면 0). 제공자: 탐색기, 나중엔 서버 저장소.',
};
