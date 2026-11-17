/**
 * 「서버 연결」 신분증 — 앱이 Supabase 서버와 말하는 통로. ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'server-link',
    name: '서버 연결',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'platform',
    icon: 'database',
    description: '학교 서버(Supabase)와 로그인 상태를 잇고, 바뀐 것만 골라 읽습니다.',
    about: {
        what: '여러 선생님이 같은 시간표를 함께 쓸 때 학교 서버와 말하는 통로입니다. 로그인 상태를 지켜보고, 30초마다 「바뀐 것이 있나」만 가볍게 물어 바뀐 조각만 다시 읽습니다.',
        use: [
            '서버에 올린 시간표를 여러 사람이 함께 볼 때',
            '보결 목록이 다른 사람 손에서 바뀌었는지 알아볼 때',
        ],
        off: '서버와 말하지 않고 이 기기 안에서만 돕니다. 이 기기에 적어 둔 내용은 그대로 남습니다.',
        with: '서버 주소가 설정에 없으면 조용히 쉬고, 앱은 로컬로 돕니다.',
    },
};
