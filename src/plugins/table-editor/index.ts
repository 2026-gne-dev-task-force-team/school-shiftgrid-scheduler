/**
 * 제공자 플러그인 「table-editor」 — table 약속을 채운다(provides: table · 모듈 값은 아래 tableApi).
 *   손님(roster·시간표 그리드)이 host.modules 로 table 모듈을 받아 Table 을 쓴다. 화면·명령은 안 낸다(헤드리스 제공자).
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { tableApi } from './api';

export const tableEditorPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { table: '0.1.0' },
    },
    modules: { table: tableApi },
});
export default tableEditorPlugin;
