/**
 * 「보결 목록·내 것」 플러그인 — 화면 둘(목록 · 내 것) · 명령 둘(리본). 자료는 list/source 한 창구.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { ListPanel, MinePanel } from './ListPanels';
import { RegisterPanel } from './RegisterPanel';
import { DetailPanel } from './DetailPanel';
import { AdminPanel } from './AdminPanel';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Staff } from '../staff/contracts/staff';
import { setSlotSource, subSlotSource } from './list/source';
import { runSlotMigration } from './migrate';
import { setStaffGetter } from './people';
import { setNodes, subApi, subNodeTypes } from './store';

export const opsSubPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            interfaces: [{ name: 'sub', version: '0.1.0', label: '보결 줄', desc: '날짜·반·시각별 보결 줄' }],
            nodeTypes: subNodeTypes,
            views: [
                { id: 'list', title: '보결 목록', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'List' },
                { id: 'mine', title: '내 보결', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Mine' },
                { id: 'register', title: '보결 등록', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Register' },
                { id: 'detail', title: '보결 상세', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Detail' },
                { id: 'admin', title: '보결 관리', icon: 'list', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, layout: { minWidth: 280, squeeze: 'scroll' }, component: 'Admin' },
            ],
            commands: [
                { id: 'ops-sub.open-list', title: '보결 목록 열기', icon: 'list' },
                { id: 'ops-sub.open-mine', title: '내 보결 열기', icon: 'list' },
                { id: 'ops-sub.open-register', title: '보결 등록 열기', icon: 'list' },
                { id: 'ops-sub.open-detail', title: '보결 상세 열기', icon: 'list' },
                { id: 'ops-sub.open-admin', title: '보결 관리 열기', icon: 'list' },
            ],
            ribbon: [{ commandId: 'ops-sub.open-list', icon: 'list', order: 12 }, { commandId: 'ops-sub.open-mine', icon: 'list', order: 8 }],
        },
    },
    components: { List: ({ host }) => createElement(ListPanel, { onOpen: () => { host.workspace.open('ops-sub.detail', { where: 'center' }); }, onRegister: () => { host.commands.run('ops-sub.open-register'); } }), Mine: () => createElement(MinePanel), Register: () => createElement(RegisterPanel), Detail: () => createElement(DetailPanel), Admin: () => createElement(AdminPanel) },
    // 🔴 sub 약속을 채우는 모듈(provides 와 짝).
    modules: { sub: subApi },
    lifecycle: {
        // 노드 다리·사람 읽기를 쥐고, 화면이 읽는 창구를 노드로 바꾸고, 옛 기기 저장소 줄을 한 번 옮긴다(멱등 · 노드가 꺼져 있으면 미룸).
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            setNodes(nodes ?? null);
            setStaffGetter(() => host.modules.use<Staff>('staff') ?? null);
            if (!nodes) return;
            setSlotSource(subSlotSource(subApi));
            try { runSlotMigration(nodes); } catch { /* 이사 실패가 켜짐을 막지 않는다 */ }
        },
        onDeactivate() { setNodes(null); setStaffGetter(() => null); },
    },
    commands: {
        'ops-sub.open-list': (host: PluginHost) => { host.workspace.open('ops-sub.list', { where: 'center' }); },
        'ops-sub.open-mine': (host: PluginHost) => { host.workspace.open('ops-sub.mine', { where: 'center' }); },
        'ops-sub.open-register': (host: PluginHost) => { host.workspace.open('ops-sub.register', { where: 'center' }); },
        'ops-sub.open-detail': (host: PluginHost) => { host.workspace.open('ops-sub.detail', { where: 'center' }); },
        'ops-sub.open-admin': (host: PluginHost) => { host.workspace.open('ops-sub.admin', { where: 'center' }); },
    },
});

export default opsSubPlugin;
