/**
 * 「account」 신분증 — 계정 제공자. id 는 폴더명과 같다(구조 검사 ⑧).
 *   제공: identity(누구)·permit(판정) · 지원: credential(증명 · 없어도 켜진다) · 필요: nodes(계정 데이터를 레코드 노드로).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'account',
    name: '계정',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'app',
    description: '프로젝트에 암호를 걸고 사용자·역할을 관리합니다.',
    about: {
        what: '프로젝트에 암호를 걸고, 사용자와 역할(권한 묶음)을 만들어 관리합니다. 역할에 따라 화면에서 보이고 숨겨지는 것이 달라집니다. 지금 누가 들어와 있는지는 오른쪽 아래에 보이고, 거기서 들어가기·나가기·사용자 바꾸기를 합니다.',
        use: [
            '여러 사람이 쓰는 프로젝트에 암호를 걸고 싶을 때',
            '사람마다 할 수 있는 일을 역할로 나누고 싶을 때',
        ],
        off: '암호·사용자·역할 기능이 빠지고, 오른쪽 아래 ‘지금 누구’ 표시도 사라집니다. 저장해 둔 사용자·역할 정보는 지워지지 않습니다.',
    },
};
