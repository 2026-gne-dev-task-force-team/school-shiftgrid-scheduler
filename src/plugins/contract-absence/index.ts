/**
 * 약속 플러그인 「contract-absence」 — absence 약속 한 장만 선언한다(모듈 0 · 화면 0).
 *   🔗 uses: clock — 타입(Weekday·IsoDate·TimeRange)이 contract-clock 을 import 한다.
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractAbsencePlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: { interfaces: [{ name: 'absence', version: '0.1.0', uses: ['clock'] }] },
    },
});
export default contractAbsencePlugin;
