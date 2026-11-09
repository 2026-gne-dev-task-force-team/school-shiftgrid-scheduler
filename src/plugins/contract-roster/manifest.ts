/**
 * 약속 플러그인 「contract-roster」 신분증 — 약속 1장(roster). ⛔ 코어 아님(학교 약속은 쓸 때만 박는다 · 필요 없으면 뺀다).
 *   id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-roster',
    name: '약속: 명부',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '명부 약속(roster 0.1) — 사람·반·과목·특별실. 타입만(모듈 0·화면 0). 제공자: school-roster(M1).',
    about: {
        what: '학교의 사람·반·과목·특별실을 어떻게 적을지 정해 둔 약속입니다. 화면은 없습니다.',
        use: [
            '학교 명부를 다루는 기능을 켤 때 함께 켜 둡니다',
        ],
        off: '이 약속을 쓰는 기능이 함께 꺼집니다. 저장된 자료는 지워지지 않습니다.',
    },
};
