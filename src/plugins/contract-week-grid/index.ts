/**
 * 약속 플러그인 「contract-week-grid」 — week-grid 약속 한 장만 선언한다(모듈 0 · 화면 0).
 *   🔗 uses: clock — 행 시각 타입(Minute·TimeRange)이 contract-clock 을 import 한다. clock 약속이 없으면 이 약속도 「약속 없음」으로 막힌다.
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractWeekGridPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: { interfaces: [{ name: 'week-grid', version: '0.1.0', uses: ['clock'] }] },
    },
});
export default contractWeekGridPlugin;
