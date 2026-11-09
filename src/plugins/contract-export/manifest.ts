/**
 * 약속 플러그인 「contract-export」 신분증 — 약속 1장(export). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-export',
    name: '약속: 내보내기',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '내보내기 약속(export 0.1) — 인쇄·PDF·엑셀 읽기/쓰기. 타입만(학교 낱말 모름). 제공자: export(M1).',
    about: {
        what: '인쇄·PDF·엑셀로 내보내고 읽어 오는 방법을 정해 둔 약속입니다. 화면은 없습니다.',
        use: [
            '내보내기 기능을 켤 때 함께 켜 둡니다',
        ],
        off: '이 약속을 쓰는 기능이 함께 꺼집니다. 저장된 자료는 지워지지 않습니다.',
    },
};
