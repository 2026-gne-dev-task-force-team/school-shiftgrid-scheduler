/**
 * 제공자 플러그인 「table-editor」 신분증 — table 약속을 채운다(provides·뷰·명령은 index 에서). id 는 폴더명과 같다(구조 검사 ⑧).
 *   코어 아님 — 설정 「플러그인」에서 끌 수 있다. 이미 PLUGINS 에 등록돼 있다(db9eda7).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

// satisfies 로 둬서 contributes 키가 추론 타입에 안 생긴다(provides·contributes 는 index 에서 더한다).
export const manifest = {
    id: 'table-editor',
    name: '표 편집기',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '엑셀·한글 표처럼 바로 쓰는 표를 어디서나 쓰게 해 주는 꾸러미. 「표 연습장」을 열면 직접 만져 볼 수 있어요.',
} satisfies PluginManifest;
