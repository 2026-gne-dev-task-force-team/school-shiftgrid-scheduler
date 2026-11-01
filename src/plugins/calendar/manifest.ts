/**
 * 「달력」 신분증 — 구글 캘린더 같은 월 보기(쥔님 2026-11-01: *"캘린더 뷰는 노션 처럼 만들어서 캘린더 뷰 플러그인으로 들이고"*).
 *   ⛔ 코어 아님 — 설정 「플러그인」에서 끌 수 있다. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'calendar',
    name: '달력',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '구글 캘린더 같은 월 보기 — 월 그리드 하나(일정·추가 없음)',
};
