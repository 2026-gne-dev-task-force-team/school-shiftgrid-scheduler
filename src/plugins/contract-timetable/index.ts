/**
 * 약속 플러그인 「contract-timetable」 — timetable 약속 한 장만 선언한다(모듈 0 · 화면 0).
 *   🔗 uses: clock — 타입(Weekday·IsoDate)이 contract-clock 을 import 한다. (roster 는 타입으로 import 하지 않아 uses 에 없다 — 실제 import 만.)
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractTimetablePlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: { interfaces: [{ name: 'timetable', version: '0.1.0', label: '확정 시간표', uses: ['clock'] }] },
    },
});
export default contractTimetablePlugin;
