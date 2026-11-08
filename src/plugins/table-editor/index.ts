/**
 * 「table-editor」 꾸러미 — table 약속을 **들고 와**(contributes.interfaces) 채운다(provides: table · 모듈 값은 tableApi).
 *   손님(roster·시간표 그리드)이 host.modules 로 table 모듈을 받아 Table 을 쓴다.
 *   🔴 약속·제공·엔진·기능 모듈을 한 폴더(이 꾸러미)에 묶는다(2026-11-08 「플러그인은 꾸러미다」).
 *   ⭐ M2: 「표 연습장」 뷰 하나를 낸다 — 손님 배선 전에도 이 표 하나로 무엇이 되는지 눈으로 본다(쥔님이 직접 만져 보는 자리).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { tableApi } from './api';
import { PlaygroundView } from './views/PlaygroundView';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'table-editor.' 를 붙인다). contributes 엔 접두사 없는 'playground' 로.
const PLAYGROUND_ID = 'table-editor.playground';

export const tableEditorPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { table: '0.1.0' },
        contributes: {
            // 🔴 table 약속을 들고 온다(꾸러미 매니페스트) — 켜진 table-editor 가 호스트 약속 목록에 table 을 올린다.
            interfaces: [{ name: 'table', version: '0.1.0', label: '표', desc: '값을 담는 표' }],
            // 표 연습장 — 가운데 싱글턴(한 장만). 손님과 무관한 「만져 보는」 화면.
            views: [{
                id: 'playground', title: '표 연습장', icon: 'table', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 320, squeeze: 'scroll' },
                component: 'Playground',
            }],
            commands: [{ id: 'table-editor.openPlayground', title: '표 연습장 열기', icon: 'table' }],
            ribbon: [{ commandId: 'table-editor.openPlayground', icon: 'table', order: 6 }],
        },
    },

    components: {
        // 연습장 화면 — 자기 자료(연습용)를 들고 Table 을 모든 기능 켜서 그린다. host 는 안 쓴다.
        Playground: () => createElement(PlaygroundView),
    },
    commands: {
        'table-editor.openPlayground': (host: PluginHost) => { host.workspace.open(PLAYGROUND_ID, { where: 'center' }); },
    },
    // 🔴 table 인터페이스를 채우는 모듈(provides 와 짝). host.modules.use<TableApi>('table') 가 이걸 받는다.
    modules: { table: tableApi },
});
export default tableEditorPlugin;
