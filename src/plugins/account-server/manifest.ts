/**
 * 「서버 계정」 신분증 — 서버(Supabase)로 로그인하는 계정 제공자(③ F2 · 10절). ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'account-server',
    name: '서버 계정',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'app',
    icon: 'user',
    description: '학교 서버에 이메일로 로그인하고, 초대 코드로 가입합니다.',
    about: {
        what: '여러 선생님이 학교 서버의 같은 시간표를 함께 쓸 때, 각자 이메일과 비밀번호로 로그인합니다. 처음 오는 분은 관리자에게 받은 초대 코드로 가입하면 바로 로그인됩니다. 지금 누가 들어와 있는지는 오른쪽 아래에 보입니다.',
        use: [
            '학교 서버에 올린 시간표를 내 계정으로 볼 때',
            '관리자에게 받은 초대 코드로 처음 가입할 때',
        ],
        off: '서버 로그인 단추가 사라집니다. 서버에 있는 계정과 자료는 그대로 남습니다.',
        with: '서버 주소가 설정에 없으면 조용히 쉬고, 이 기기 안의 계정(계정 꾸러미)이 그대로 돕니다.',
    },
};
