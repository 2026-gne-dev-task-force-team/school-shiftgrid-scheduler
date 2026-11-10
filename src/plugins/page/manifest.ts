/**
 * 「page」 신분증 — 노션식 마크다운 노트 꾸러미. id 는 폴더명과 같다(구조 검사 ⑧).
 *   코어 아님 — 설정 「플러그인」에서 끌 수 있다. 등록 한 줄(PLUGINS)은 메인 세션 몫.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

// satisfies 로 둬서 contributes 키가 추론 타입에 안 생긴다(provides·contributes 는 index 에서 더한다).
export const manifest = {
    id: 'page',
    name: '노트',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'platform',
    description: '노션처럼 마크다운을 치면 블록으로 바뀌는 노트를 만들고, 그 안에 표를 넣어 쓸 수 있어요.',
    about: {
        what: '글을 쓰는 노트를 만듭니다. 「# 」로 제목, 「- 」로 목록처럼 치는 대로 모양이 바뀌고, 노트 안에 표를 넣을 수 있습니다.',
        use: [
            '회의 기록·메모처럼 글로 남길 것이 있을 때',
            '설명 글과 표를 한 장에 같이 두고 싶을 때',
        ],
        off: '노트 화면이 사라집니다. 써 둔 노트는 지워지지 않고, 다시 켜면 그대로 보입니다.',
        with: '만든 노트는 탐색기 나무에 담깁니다. 노트 안의 표는 표 편집기로 그립니다.',
    },
} satisfies PluginManifest;
