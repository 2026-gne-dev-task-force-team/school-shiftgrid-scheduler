/**
 * 「시간표 짜기」 플러그인 — 화면 하나(편성 iframe). 노드 붙임·platform 교체는 P10b 이후.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { V1EditorFrame } from './frame';

export const v1EditorPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: [{
                id: 'edit', title: '시간표 편성', icon: 'table', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 480, squeeze: 'scroll' },
                component: 'Edit',
            }],
        },
    },
    components: { Edit: () => createElement(V1EditorFrame) },
});

export default v1EditorPlugin;
