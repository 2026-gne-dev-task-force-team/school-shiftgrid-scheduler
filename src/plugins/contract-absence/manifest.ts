/**
 * 약속 플러그인 「contract-absence」 신분증 — 약속 1장(absence). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-absence',
    name: '약속: 부재',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '복무·부재 약속(absence 0.1) — 출장·연수·병가 + 고정 일정(회의). 타입만. clock 에 기댄다(uses). 제공자: absence(M1).',
    about: {
        what: '출장·연수·병가 같은 부재와 회의 같은 고정 일정을 어떻게 적을지 정해 둔 약속입니다. 화면은 없고, 다른 기능들이 같은 말로 부재를 주고받게 해 줍니다.',
        use: [
            '복무·부재를 다루는 기능을 켤 때 함께 켜 둡니다',
        ],
        off: '이 약속을 쓰는 기능이 함께 꺼집니다. 저장된 자료는 지워지지 않습니다.',
        with: '시각 약속과 같이 씁니다.',
    },
};
