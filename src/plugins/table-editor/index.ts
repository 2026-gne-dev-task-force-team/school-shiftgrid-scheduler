/**
 * 「table-editor」 꾸러미 — table 약속을 **들고 와**(contributes.interfaces) 채운다(provides: table · 모듈 값은 tableApi).
 *   손님(roster·시간표 그리드)이 host.modules 로 table 모듈을 받아 Table 을 쓴다. 화면·명령은 안 낸다(헤드리스 꾸러미).
 *   🔴 약속·제공·엔진·기능 모듈을 한 폴더(이 꾸러미)에 묶는다(2026-11-08 「플러그인은 꾸러미다」).
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { tableApi } from './api';

export const tableEditorPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { table: '0.1.0' },
        // 🔴 table 약속을 들고 온다(꾸러미 매니페스트) — 켜진 table-editor 가 호스트 약속 목록에 table 를 올린다.
        contributes: {
            interfaces: [{ name: 'table', version: '0.1.0' }],
        },
    },
    modules: { table: tableApi },
});
export default tableEditorPlugin;
