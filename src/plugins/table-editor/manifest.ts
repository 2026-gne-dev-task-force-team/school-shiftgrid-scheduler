/**
 * 제공자 플러그인 「table-editor」 신분증 — table 약속을 채운다(index 에서 provides). id 는 폴더명과 같다(구조 검사 ⑧).
 *   코어 아님 — 쓰는 손님(roster·시간표 그리드)이 생길 때 PLUGINS 에 한 줄 더한다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

// satisfies 로 둬서 contributes 키가 추론 타입에 안 생긴다(헤드리스 제공자 — 뷰·명령 0, provides 는 index 에서).
export const manifest = {
    id: 'table-editor',
    name: '표 편집기',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '범용 표 편집기(엑셀·한글 표식) — 엔진 + 조립형 기능 모듈. 손님은 host.modules 로 table 모듈을 받아 Table 을 쓴다.',
} satisfies PluginManifest;
