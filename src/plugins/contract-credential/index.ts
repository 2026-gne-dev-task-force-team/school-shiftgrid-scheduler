/**
 * 약속 플러그인 「contract-credential」 — credential 약속 한 장만 선언한다(모듈 0 · 화면 0). uses 없음(다른 약속에 안 기댄다).
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractCredentialPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: { interfaces: [{ name: 'credential', version: '0.1.0' }] },
    },
});
export default contractCredentialPlugin;
