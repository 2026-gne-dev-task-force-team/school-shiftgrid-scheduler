/**
 * 약속 플러그인 「contract-table」 — table 약속 한 장만 선언한다(모듈 0 · 화면 0). uses 없음(가장 아래 범용 약속).
 *   채우는 쪽은 table-editor(provides: table). 타입은 ./types.
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractTablePlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: { interfaces: [{ name: 'table', version: '0.1.0' }] },
    },
});
export default contractTablePlugin;
