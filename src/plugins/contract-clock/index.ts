/**
 * 약속 플러그인 「contract-clock」 — clock 약속 한 장만 선언한다(모듈 0 · 화면 0). uses 없음(시각 낱말의 주인).
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractClockPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: { interfaces: [{ name: 'clock', version: '0.1.0' }] },
    },
});
export default contractClockPlugin;
