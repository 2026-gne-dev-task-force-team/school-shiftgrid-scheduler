/**
 * 「시간표 짜기」 플러그인 — 화면 하나(편성 iframe). 노드 붙임·platform 교체는 P10b 이후.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
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
            commands: [
                { id: 'v1-editor.open-edit', title: 'v1 편성기 열기', icon: 'edit', keywords: ['v1', '편성', '편성기'] },
                { id: 'v1-editor.open-grid', title: '시간표 읽기 격자 열기', icon: 'table', keywords: ['v1', '격자', '시간표', '읽기'] },
                { id: 'v1-editor.open-versions', title: '판·적용 기간 열기', icon: 'table', keywords: ['v1', '판', '기간', '적용', '시간표'] },
            ],
            ribbon: [{ commandId: 'v1-editor.open-edit', icon: 'edit', order: 10 }],
        },
    },
    commands: {
        'v1-editor.open-edit': (host: PluginHost) => { host.workspace.open('v1-editor.edit', { where: 'center' }); },
        'v1-editor.open-grid': (host: PluginHost) => { host.workspace.open('v1-editor.grid', { where: 'center' }); },
        'v1-editor.open-versions': (host: PluginHost) => { host.workspace.open('v1-editor.versions', { where: 'center' }); },
    },
    components: {
        Edit: () => createElement(V1EditorFrame),
        Grid: () => createElement(VersionedGrid),
        Versions: () => createElement(VersionsPanel),
    },
});

export default v1EditorPlugin;
