/**
 * 약속 플러그인 「contract-roster」 — roster 약속 한 장만 선언한다(모듈 0 · 화면 0). uses 없음(가장 아래 약속).
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractRosterPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: { interfaces: [{ name: 'roster', version: '0.1.0', label: '사람·반·과목·특별실' }] },
    },
});
export default contractRosterPlugin;
