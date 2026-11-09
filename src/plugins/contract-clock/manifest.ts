/**
 * 약속 플러그인 「contract-clock」 신분증 — 약속 1장(clock). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-clock',
    name: '약속: 시각',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '시각 약속(clock 0.1) — 얇은 창구: 행 시각을 내준다 + 공용 시각 낱말(Weekday·Minute·TimeRange·IsoDate). 타입만. 제공자: 그리드·school-clock(나중).',
    about: {
        what: '요일·교시·시각을 어떻게 적을지 정해 둔 약속입니다. 화면은 없고, 시간표와 일정 기능이 같은 시각 말을 쓰게 해 줍니다.',
        use: [
            '시간표·부재·시간표 모양 약속을 쓸 때 함께 켜 둡니다',
        ],
        off: '이 약속을 쓰는 기능이 함께 꺼집니다. 저장된 자료는 지워지지 않습니다.',
        with: '시간표·부재·시간표 모양 약속이 이 약속에 기댑니다.',
    },
};
