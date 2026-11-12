/**
 * 「학사」 신분증(P21) — 학사 일정·시간표 변경을 보고 고친다. ⛔ 코어 아님. id 는 폴더명과 같다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'ops-days',
    name: '학사',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'calendar',
    description: '학사 일정과 시간표 변경을 보고, 역할에 맞게 넣고 지웁니다.',
    about: {
        what: '날짜순으로 학사 일정(행사·휴업일)과 시간표 변경을 보여 줍니다. 교사는 시간표 변경을 넣고 자기 것만 지울 수 있고, 학사 일정과 고치기는 교무·교감·근태담당·관리자만 합니다.',
        use: ['휴업일·행사를 확인할 때', '하루 수업 바꾸기를 알릴 때'],
        off: '학사 화면만 사라집니다. 자료는 그대로입니다.',
        with: '자료는 학사 창구(source) 한 곳으로 읽고 씁니다.',
    },
};
