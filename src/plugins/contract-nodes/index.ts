/**
 * 약속 플러그인 「contract-nodes」 — nodes 약속 한 장만 선언한다(모듈 0 · 화면 0 · 명령 0).
 *   ⭐ 약속은 제공자 없이 먼저 산다 — 이 플러그인이 켜져 있으면 호스트의 약속 목록에 「nodes 0.1」이 뜬다.
 *      채우는 쪽은 project-explorer(provides: nodes), 나중엔 서버 저장소. 타입 정의는 ./types.
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractNodesPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            interfaces: [{ name: 'nodes', version: '0.1.0' }],
        },
    },
});
export default contractNodesPlugin;
