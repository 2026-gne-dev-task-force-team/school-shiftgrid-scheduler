/** 「복무」 신분증 — 교직원의 출장·연수·연가·병가를 적는 대장. ⛔ 코어 아님. id 는 폴더명과 같다(구조 검사 ⑧). */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'duty',
    name: '복무',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'schedule',
    description: '출장·연수·연가·병가 같은 복무를 적는 대장입니다.',
    about: {
        what: '선생님이 언제 학교에 없는지 적어 두는 대장입니다. 출장·연수·연가·병가·조퇴 같은 복무를 날짜와 교시로 적습니다.',
        use: [
            '출장·연수·휴가 일정을 한곳에 모아 둘 때',
            '보결이 「그 시간에 누가 학교에 없나」를 알아야 할 때',
        ],
        off: '복무 대장 화면이 사라집니다. 적어 둔 기록은 지워지지 않고, 다시 켜면 그대로 보입니다.',
        with: '만든 대장은 탐색기 나무에 담깁니다. 사람 칸은 사람 명단에서 고릅니다.',
    },
};
