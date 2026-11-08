/**
 * 「레코드 뷰 연습장」 꾸러미 신분증 — 공통 목록 화면 부품(레코드 뷰)을 직접 만져 보는 자리.
 *   id 는 폴더명과 같다(구조 검사 ⑧). 코어 아님 — 설정 「플러그인」에서 끌 수 있다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest = {
    id: 'record-playground',
    name: '레코드 뷰 연습장',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '노션 표 보기처럼 목록을 보고·고치고·거르고·정렬하는 공통 화면 부품을 직접 만져 보는 자리예요.',
} satisfies PluginManifest;
