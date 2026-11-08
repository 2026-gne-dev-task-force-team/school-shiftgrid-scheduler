/**
 * 약속 플러그인 「contract-calendar」 — calendar 약속 한 장만 선언한다(모듈 0 · 화면 0). uses 없음(contract-clock 에 안 기댄다).
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractCalendarPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: { interfaces: [{ name: 'calendar', version: '0.1.0' }] },
    },
});
export default contractCalendarPlugin;
