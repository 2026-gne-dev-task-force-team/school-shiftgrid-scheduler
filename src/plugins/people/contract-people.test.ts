/**
 * 약속 「people」 — 🔴 꾸러미 전환(2026-11-08 「플러그인은 꾸러미다」): 약속은 people 꾸러미가 들고 온다(contributes.interfaces).
 *   타입은 꾸러미 안 contracts/people(값 0) · 폴더명=id(구조 검사 ⑧) · 켜면 약속 목록에 뜨고 같은 꾸러미가 provides 로 채운다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as peopleTypes from './contracts/people';
import { peoplePlugin } from './index';
import type { PluginModule } from '../../pane-ui-system/plugin';
import { activateAll, listPlugins, listInterfaces, disposeOwner } from '../../pane-ui-system/plugin';

// 🔴 people 은 requires.nodes — nodes 약속을 들고 오고 채우는 코어 가짜가 먼저 있어야 막히지 않는다(탐색기 꾸러미 흉내).
const nodesProvider: PluginModule = {
    manifest: {
        id: 'fake-nodes', name: 'PE', version: '0.1.0', minHostVersion: '0.1.0', core: true,
        provides: { nodes: '0.1.0' },
        contributes: { interfaces: [{ name: 'nodes', version: '0.1.0' }] },
    },
    modules: {
        nodes: {
            registerContributed: () => ({ dispose() { /* 테스트 */ } }),
            subscribe: () => ({ dispose() { /* 테스트 */ } }),
            byType: () => [],
        },
    },
} as PluginModule;

afterEach(() => { for (const id of ['people', 'fake-nodes']) disposeOwner(id); });

describe('people 약속 — 값 0 · 꾸러미가 들고 옴 · 활성', () => {
    it('🔴 contracts/people 는 런타임 값이 0이다(타입만 — 컴파일 뒤 사라진다)', () => {
        expect(Object.keys(peopleTypes)).toEqual([]);
    });

    it('people 꾸러미가 people 약속 0.1.0 을 들고 오고(contributes.interfaces) provides 로 채운다', () => {
        expect(peoplePlugin.manifest.id).toBe('people');
        const ifaces = peoplePlugin.manifest.contributes?.interfaces ?? [];
        expect(ifaces).toEqual([{ name: 'people', version: '0.1.0' }]);
        expect(peoplePlugin.manifest.provides?.people).toBe('0.1.0');
    });

    it('켜면 막히지 않고 약속 목록에 people 이 people 꾸러미가 채운 것으로 뜬다', () => {
        activateAll([nodesProvider, peoplePlugin]);
        const p = listPlugins().find((x) => x.id === 'people')!;
        expect(p.failed).toBe(false);
        expect(p.blocked).toBe(false);
        const people = listInterfaces().find((i) => i.name === 'people');
        expect(people).toBeTruthy();
        expect(people!.declaredBy).toBe('people');   // 약속을 들고 온 꾸러미 = 채우는 꾸러미(같다)
        expect(people!.provider).toBe('people');
    });
});
