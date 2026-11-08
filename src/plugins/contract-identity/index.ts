/**
 * 약속 플러그인 「contract-identity」 — identity 약속 한 장만 선언한다(모듈 0 · 화면 0). uses 없음(roster 를 타입으로 import 하지 않는다).
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractIdentityPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: { interfaces: [{ name: 'identity', version: '0.2.0' }] },
    },
});
export default contractIdentityPlugin;
