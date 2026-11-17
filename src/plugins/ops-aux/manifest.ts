/**
 * 「근태」 신분증(P22) — 보조 인력 명부·배정·달력. ⛔ 코어 아님. id 는 폴더명과 같다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'ops-aux',
    name: '근태',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    supports: { staff: '^0.1', nodes: '^0.1', calendar: '^0.2' },
    icon: 'users',
    description: '보조 인력 명부와 날짜별 배정을 보고, 근태담당이 고칩니다.',
    about: {
        what: '보조 인력(기초학력 전담강사·한국어 강사·디지털 튜터·자원봉사자) 명부와 기본·날짜별 배정을 보여 줍니다. 쓰는 사람은 근태담당뿐이고, 배정이 수업·허용 교과·근무 시간과 어긋나면 「재배정 필요」로 표시합니다.',
        use: ['보조 인력을 반에 배정할 때', '14일 안 재배정이 필요한 칸을 찾을 때'],
        off: '근태 화면만 사라집니다. 자료는 그대로입니다.',
        with: '자료는 근태 창구(source) 한 곳으로 읽고 씁니다. 날짜별 배정·예외는 달력 프리셋 「근태」 일정으로 두고, 월 마감·근무 조건은 여기 남습니다.',
    },
};
