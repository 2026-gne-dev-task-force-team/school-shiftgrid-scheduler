/**
 * 「v1 파일 호환」 플러그인 — 경계 조각(1.2v 편성기 분해 F10 · 설계 3-4).
 *   F10a: 불러오기 순수 함수(./import-v1). F10b: 내보내기(./export-v1) · 정본에 칸 없던 것 따로 두기(./extras) · 내보내기 화면.
 *   화면의 「가져오기」 연결은 정본 약속이 쓰기를 내줄 때 붙인다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { ExportTab } from './views/ExportTab';
import { v1FileApi } from './api';

const VIEW_ID = 'v1-file.export';

export const v1FilePlugin = definePlugin({
    manifest: {
        ...manifest,
        requires: { nodes: '^0.1' },
        supports: { solver: '^0.2', plans: '^0.2' },
        provides: { 'v1-file': '0.1.0' },
        contributes: {
            interfaces: [{ name: 'v1-file', version: '0.1.0', label: 'v1 파일', desc: 'v1 파일 내보내기 화면·명령 id' }],
            views: [{
                id: 'export', title: 'v1 파일 내보내기', icon: 'file', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 320, squeeze: 'scroll' },
                component: 'Export',
            }],
            commands: [{ id: 'v1-file.open', title: 'v1 파일로 내보내기', icon: 'file' }],
            // 리본 — 화면·명령만 있고 누를 자리가 없어 선생님이 못 찾았다(T-10fx)
            ribbon: [{ commandId: 'v1-file.open', icon: 'file', order: 11 }],
        },
    },
    modules: { 'v1-file': v1FileApi },
    components: {
        Export: ({ host }) => createElement(ExportTab, { host }),
    },
    commands: {
        'v1-file.open': (host: PluginHost) => { host.workspace.open(VIEW_ID, { where: 'center' }); },
    },
});

export default v1FilePlugin;
