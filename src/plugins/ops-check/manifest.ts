/**
 * 「데이터 검사」 신분증 — 파일 하나를 골라 shared/check 규칙으로 화면에서 먼저 검사한다(설계 ① 11-3). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'ops-check',
    name: '데이터 검사',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    // 편성안 점검 탭이 읽는다 — 꺼져 있으면 그 탭만 「쓸 수 없습니다」(운영 점검은 그대로)
    supports: { plans: '^0.2', solver: '^0.2' },
    icon: 'shieldCheck',
    description: '가져올 파일이 규칙에 맞는지, 짜 둔 편성안에 겹침·시수 문제가 없는지 점검합니다.',
    about: {
        what: '시간표 파일(v1 문서 또는 덩어리)을 하나 고르면 규칙 17개로 검사해 통과 여부와 걸린 규칙을 보여줍니다. 파일은 읽기만 하고 바꾸지 않습니다. 「편성안 점검」 탭에서는 담아 둔 편성안을 골라 어느 반 어느 칸이 겹치는지, 시수가 모자라거나 넘치는지 선생님 말로 보여줍니다.',
        use: ['가져오기 전에 파일 꼴이 맞는지 볼 때', '서버가 거부한 이유와 같은 규칙 id 를 화면에서 확인할 때'],
        off: '검사 화면만 사라집니다. 데이터는 그대로입니다.',
        with: '규칙은 shared/check 한 벌이라 서버 검사와 같습니다.',
    },
};
