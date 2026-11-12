/**
 * 「시간표 짜기」 플러그인 — 화면 하나(편성 iframe). 노드 붙임·platform 교체는 P10b 이후.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { V1EditorFrame } from './frame';
import { VersionedGrid, VersionsPanel } from './versions';

export const v1EditorPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: [{
                id: 'edit', title: '시간표 편성', icon: 'table', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 480, squeeze: 'scroll' },
                component: 'Edit',
            }, {
                // 읽기 격자 `v1-editor.grid`(P10d·P10e) — 자료는 versions.tsx 의 가짜 어댑터에서
                id: 'grid', title: '시간표 보기', icon: 'table', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 320, squeeze: 'scroll' },
                component: 'Grid',
            }, {
                id: 'versions', title: '시간표 판·기간', icon: 'table', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Versions',
            }],
        },
    },
    components: {
        Edit: () => createElement(V1EditorFrame),
        Grid: () => createElement(VersionedGrid),
        Versions: () => createElement(VersionsPanel),
    },
});

export default v1EditorPlugin;
