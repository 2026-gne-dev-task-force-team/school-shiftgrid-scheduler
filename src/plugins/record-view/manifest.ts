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
    about: {
        what: '노션 표 보기처럼 여러 줄짜리 목록을 한 화면에서 보여 줍니다. 칸을 눌러 바로 고치고, 조건으로 거르고, 원하는 순서로 정렬할 수 있습니다.',
        use: [
            '사람·방·일정처럼 줄이 많은 목록을 한눈에 보고 고칠 때',
            '「연습장」에서 목록 화면이 어떻게 움직이는지 직접 만져 볼 때',
        ],
        off: '레코드 뷰 연습장이 사라지고, 이 화면을 빌려 쓰던 다른 꾸러미의 목록도 안 보일 수 있습니다. 저장된 자료는 지워지지 않습니다.',
        with: '다른 꾸러미가 자기 목록을 보여 줄 때 이 화면을 빌려 씁니다.',
    },
} satisfies PluginManifest;
