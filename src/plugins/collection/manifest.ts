/**
 * 「collection」 꾸러미 신분증 — 공통 목록 화면 부품(컬렉션)을 제공하고, 탐색기에서 만드는 컬렉션 노드를 연다.
 *   id 는 폴더명과 같다(구조 검사 ⑧). 코어 아님 — 설정 「플러그인」에서 끌 수 있다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

// satisfies 로 둬서 contributes 키가 추론 타입에 안 생긴다(provides·contributes 는 index 에서 더한다).
export const manifest = {
    id: 'collection',
    name: '컬렉션',
    version: '0.2.0',
    minHostVersion: '0.1.0',
    layer: 'platform',
    icon: 'database',
    description: '노션 데이터베이스처럼 칸과 행을 직접 만들어 쓰는 「컬렉션」. 탐색기에서 새로 만들 수 있고, 다른 꾸러미가 host.modules 로 이 화면을 빌려 쓸 수도 있어요.',
    about: {
        what: '노션 데이터베이스처럼 칸(글자·숫자·고르기·여러 개·날짜·체크)을 정하고 행을 넣는 표입니다. 칸을 눌러 바로 고치고, 조건으로 거르고, 원하는 순서로 정렬하고, 엑셀 표를 붙여넣어 한꺼번에 넣을 수 있습니다.',
        use: [
            '탐색기에서 「새로 만들기 ▸ 컬렉션」로 나만의 목록을 만들 때',
            '행이 많은 목록을 한눈에 보고 고칠 때',
        ],
        off: '컬렉션 화면이 안 열리고, 이 화면을 빌려 쓰던 다른 꾸러미의 목록도 안 보일 수 있습니다. 만든 컬렉션와 행은 탐색기 나무에 그대로 남고, 지워지지 않습니다.',
        with: '다른 꾸러미가 자기 목록을 보여 줄 때 이 화면을 빌려 씁니다.',
    },
} satisfies PluginManifest;
