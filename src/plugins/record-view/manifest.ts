/**
 * 「record-view」 꾸러미 신분증 — 공통 목록 화면 부품(레코드 뷰)을 제공하고, 「연습장」으로 직접 만져 보는 자리.
 *   id 는 폴더명과 같다(구조 검사 ⑧). 코어 아님 — 설정 「플러그인」에서 끌 수 있다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

// satisfies 로 둬서 contributes 키가 추론 타입에 안 생긴다(provides·contributes 는 index 에서 더한다).
export const manifest = {
    id: 'record-view',
    name: '레코드 뷰',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '노션 표 보기처럼 목록을 보고·고치고·거르고·정렬하는 공통 화면 부품. 다른 꾸러미가 host.modules 로 받아 쓰고, 「연습장」을 열면 직접 만져 볼 수 있어요.',
} satisfies PluginManifest;
