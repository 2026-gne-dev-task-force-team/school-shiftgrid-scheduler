/**
 * 「데이터 검사」 플러그인 — 파일 하나를 골라 sniff → checkV1/checkBundle → 결과 판. 화면 하나 · 명령 하나(리본).
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { CheckPanel } from './CheckPanel';

export const opsCheckPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: [{
                id: 'panel', title: '데이터 검사', icon: 'shieldCheck', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Panel',
            }],
            commands: [{ id: 'ops-check.open', title: '데이터 검사 열기', icon: 'shieldCheck' }],
            ribbon: [{ commandId: 'ops-check.open', icon: 'shieldCheck', order: 9 }],
        },
    },
    components: { Panel: () => createElement(CheckPanel) },
    commands: { 'ops-check.open': (host: PluginHost) => { host.workspace.open('ops-check.panel', { where: 'center' }); } },
});

export default opsCheckPlugin;
