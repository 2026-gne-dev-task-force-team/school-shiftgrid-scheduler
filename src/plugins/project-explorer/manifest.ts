/**
 * 「프로젝트 탐색기」 신분증 — 코어 플러그인(끌 수 없다 · 먼저 산다). id 는 폴더명과 같다(구조 검사 ⑧).
 *   쥔님 2026-11-01 17:28: *"프로젝트 탐색기로 하자. 그리고 VS 코드로 가자"*.
 *   ⭐ 노드 하이라키 한 벌(타입 규격 + 나무 + 탐색기 패널)을 내준다 — 교사·시간표 타입은 각 플러그인이 꽂는다(N4).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'project-explorer',
    name: '프로젝트 탐색기',
    version: '0.1.0',
    minHostVersion: '0.1.0',   // 캘린더와 같게
    core: true,
    description: '노드 하이라키 한 벌 + 파일 탐색기 패널 — 폴더 나무(만들기·이름·접기·기기별 저장)',
};
