/**
 * 속성 플러그인 — 오른쪽 패널에 「속성」 뷰 하나. 칸은 남이 낸다(contributes.properties → listPropertiesPanes).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { PropertiesView } from './views/PropertiesPanel';

export const propertiesPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: [{
                id: 'panel', title: '속성', icon: 'info', defaultArea: 'right',
                description: '고른 것의 속성 — 칸은 그 대상을 가진 플러그인이 낸다',
                placement: { singleton: true },
                layout: { minWidth: 200, squeeze: 'scroll' },
                component: 'Panel',
            }],
        },
    },
    components: {
        Panel: () => createElement(PropertiesView),
    },
});

export default propertiesPlugin;
