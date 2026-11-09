/**
 * 속성 플러그인 — 오른쪽 패널에 「속성」 뷰 하나. 칸은 남이 낸다(contributes.properties → listPropertiesPanes).
 */
import { createElement } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { PropertiesView } from './views/PropertiesPanel';

export const propertiesPlugin = definePlugin({
    manifest: {
        ...manifest,
        supports: { selection: '^0.1' },   // 고른 것을 여기서 듣는다
        contributes: {
            views: [{
                id: 'panel', title: '속성', icon: 'info', defaultArea: 'right',
                description: '고른 것의 속성 — 칸은 그 대상을 가진 플러그인이 낸다',
                placement: { singleton: true },
                layout: { minWidth: 200, squeeze: 'scroll' },
                component: 'Panel',
            }],
            // 닫아도 다시 열 길(Q1·X7) — 명령 팔레트 + 리본. 제 `<id>.open` 명령이 있으면 창틀은 같은 명령을 또 만들지 않는다.
            commands: [{ id: 'properties.open', title: '속성 패널 열기', icon: 'info' }],
            ribbon: [{ commandId: 'properties.open', icon: 'info' }],
        },
    },
    // 첫 실행 때 오른쪽에 한 번 연다(기기별 한 번 — 닫으면 그대로 닫혀 있다).
    lifecycle: { onFirstRun: (host) => { host.workspace.open('properties.panel', { where: 'right' }); } },
    commands: {
        'properties.open': (host: PluginHost) => { host.workspace.open('properties.panel', { where: 'right' }); },
    },
    components: {
        Panel: (p: { host: PluginHost }) => createElement(PropertiesView, { host: p.host }),
    },
});

export default propertiesPlugin;
