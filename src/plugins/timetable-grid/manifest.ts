/**
 * 「시간표 그리드」 신분증 — 아무것도 몰라도 표부터 그리는 시간표 편집기(명세 [[시간표 그리드 요구명세]]).
 *   ⛔ 코어 아님 — 설정 「플러그인」에서 끌 수 있다. id 는 폴더명과 같다(구조 검사 ⑧).
 *   🔴 학교를 모른다 — 교시·반·과목·담임·급식 낱말이 그리드 안에 없다(2교대·3교대 당직표도 같은 물건으로 짠다).
 *   id 에 도메인 낱말(school-)을 붙이지 않는다(모듈·의존성 요구명세 — 나중에 범용으로 올릴 때 비용이 적게).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'timetable-grid',
    name: '시간표 그리드',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '시간표 한 장을 그리는 편집기 — 범위·열(요일/일차)·행(이름+시각)·칸(글자·셀 병합) + 특별 시간표. 칸 글자의 뜻은 모른다.',
};
