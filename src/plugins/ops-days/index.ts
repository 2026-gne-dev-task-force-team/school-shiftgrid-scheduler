/**
 * 「학사」 플러그인 — 화면 하나(학사) · 명령 하나(리본). 자료는 source 한 창구.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { DaysPanel } from './DaysPanel';
import { initDaysMigration, registerAcademicPreset } from './boot';

// 🔴 T-10fb — 달력 프리셋 「학사」 등록 + 옛 자료 이사(약속이 꺼져 있으면 미룸 · 두 번 돌아도 같음).
let migrationSub: { dispose(): void } | null = null;
let presetReg: { dispose(): void } | null = null;
const stop = () => { migrationSub?.dispose(); migrationSub = null; presetReg?.dispose(); presetReg = null; };
const restart = (host: PluginHost) => { stop(); presetReg = registerAcademicPreset(host); migrationSub = initDaysMigration(host); };

export const opsDaysPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: [{ id: 'days', title: '학사', icon: 'calendar', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Days' }],
            commands: [{ id: 'ops-days.open', title: '학사 열기', icon: 'calendar' }],
            ribbon: [{ commandId: 'ops-days.open', icon: 'calendar', order: 10 }],
        },
    },
    components: { Days: ({ host }: { host: PluginHost }) => createElement(DaysPanel, { host }) },
    commands: { 'ops-days.open': (host: PluginHost) => { host.workspace.open('ops-days.days', { where: 'center' }); } },
    lifecycle: {
        onActivate(host: PluginHost) { restart(host); },
        onDeactivate() { stop(); },
        onInterface: Object.fromEntries(['calendar', 'nodes'].map((n) => [n, { attach: restart, detach: () => undefined }])),
    },
});

export default opsDaysPlugin;
