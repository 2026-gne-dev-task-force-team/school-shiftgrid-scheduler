/**
 * 약속 「clock」 — people 약속 테스트와 같은 꼴: 값 0 · 꾸러미가 들고 옴 · 켜면 막히지 않고 약속 목록에 뜸 · 모듈이 셈 함수 묶음.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as clockTypes from './contracts/clock';
import { bellPlugin } from './index';
import type { PluginModule } from '../../pane-ui-system/plugin';
import { activateAll, listPlugins, listInterfaces, disposeOwner } from '../../pane-ui-system/plugin';

const nodesProvider: PluginModule = {
    manifest: {
        id: 'fake-nodes', name: 'PE', version: '0.1.0', minHostVersion: '0.1.0', core: true,
        provides: { nodes: '0.1.0' },
        contributes: { interfaces: [{ name: 'nodes', version: '0.1.0' }] },
    },
    modules: { nodes: { registerContributed: () => ({ dispose() { /* 테스트 */ } }), subscribe: () => ({ dispose() { /* 테스트 */ } }), byType: () => [] } },
} as PluginModule;

const collectionProvider: PluginModule = {
    manifest: {
        id: 'fake-collection', name: 'RV', version: '0.1.0', minHostVersion: '0.1.0',
        provides: { collection: '0.2.0' },
        contributes: { interfaces: [{ name: 'collection', version: '0.2.0' }] },
    },
    modules: { collection: { defineCollection: () => ({ init: () => null }) } },
} as unknown as PluginModule;

afterEach(() => { for (const id of ['bell', 'fake-nodes', 'fake-collection']) disposeOwner(id); });

describe('clock 약속 — 값 0 · 꾸러미가 들고 옴 · 활성', () => {
    it('🔴 contracts/clock 는 런타임 값이 0이다(타입만)', () => {
        expect(Object.keys(clockTypes)).toEqual([]);
    });

    it('bell 꾸러미가 clock 약속 0.1.0 을 들고 오고 provides 로 채운다', () => {
        expect(bellPlugin.manifest.id).toBe('bell');
        const ifaces = bellPlugin.manifest.contributes?.interfaces ?? [];
        expect(ifaces).toHaveLength(1);
        expect(ifaces[0]).toMatchObject({ name: 'clock', version: '0.1.0' });
        expect(ifaces[0].label).toBeTruthy();
        expect(bellPlugin.manifest.provides?.clock).toBe('0.1.0');
    });

    it('켜면 막히지 않고 약속 목록에 clock 이 bell 이 채운 것으로 뜨며, 모듈은 셈 함수 묶음이다', () => {
        activateAll([nodesProvider, collectionProvider, bellPlugin]);
        const p = listPlugins().find((x) => x.id === 'bell')!;
        expect(p.failed).toBe(false);
        expect(p.blocked).toBe(false);
        const clock = listInterfaces().find((i) => i.name === 'clock');
        expect(clock!.declaredBy).toBe('bell');
        expect(clock!.provider).toBe('bell');
        const api = (bellPlugin.modules as { clock: { version: number; overlaps: unknown } }).clock;
        expect(api.version).toBe(1);
        expect(typeof api.overlaps).toBe('function');
    });
});
