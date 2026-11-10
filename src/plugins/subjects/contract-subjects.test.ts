/**
 * 약속 「subjects」 — 🔴 꾸러미 전환(2026-11-08 「플러그인은 꾸러미다」): 약속은 subjects 꾸러미가 들고 온다(contributes.interfaces).
 *   타입은 꾸러미 안 contracts/subjects(값 0) · 폴더명=id(구조 검사 ⑧) · 켜면 약속 목록에 뜨고 같은 꾸러미가 provides 로 채운다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as subjectsTypes from './contracts/subjects';
import { subjectsPlugin } from './index';
import type { PluginModule } from '../../pane-ui-system/plugin';
import { activateAll, listPlugins, listInterfaces, disposeOwner } from '../../pane-ui-system/plugin';

// 🔴 subjects 은 requires.nodes — nodes 약속을 들고 오고 채우는 코어 가짜가 먼저 있어야 막히지 않는다(탐색기 꾸러미 흉내).
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

// 🔴 컬렉션 바닥(collection)도 requires — 그 약속을 들고 오고 채우는 가짜(레코드 뷰 꾸러미 흉내). defineCollection 은 활성 때 부르니 값은 빈 모듈이면 된다.
const collectionProvider: PluginModule = {
    manifest: {
        id: 'fake-collection', name: 'RV', version: '0.1.0', minHostVersion: '0.1.0',
        provides: { collection: '0.2.0' },
        contributes: { interfaces: [{ name: 'collection', version: '0.2.0' }] },
    },
    modules: { collection: { defineCollection: () => ({ init: () => null }) } },
} as unknown as PluginModule;

afterEach(() => { for (const id of ['subjects', 'fake-nodes', 'fake-collection']) disposeOwner(id); });

describe('subjects 약속 — 값 0 · 꾸러미가 들고 옴 · 활성', () => {
    it('🔴 contracts/subjects 는 런타임 값이 0이다(타입만 — 컴파일 뒤 사라진다)', () => {
        expect(Object.keys(subjectsTypes)).toEqual([]);
    });

    it('subjects 꾸러미가 subjects 약속 0.1.0 을 들고 오고(contributes.interfaces) provides 로 채운다', () => {
        expect(subjectsPlugin.manifest.id).toBe('subjects');
        const ifaces = subjectsPlugin.manifest.contributes?.interfaces ?? [];
        expect(ifaces).toHaveLength(1);
        expect(ifaces[0]).toMatchObject({ name: 'subjects', version: '0.1.0' });
        expect(ifaces[0].label).toBeTruthy();   // 🔴 사람 이름(쥔님 2026-11-08 21:27) — 설정 상세가 id 대신 이걸 보여 준다
        expect(subjectsPlugin.manifest.provides?.subjects).toBe('0.1.0');
    });

    it('켜면 막히지 않고 약속 목록에 subjects 이 subjects 꾸러미가 채운 것으로 뜬다', () => {
        activateAll([nodesProvider, collectionProvider, subjectsPlugin]);
        const p = listPlugins().find((x) => x.id === 'subjects')!;
        expect(p.failed).toBe(false);
        expect(p.blocked).toBe(false);
        const subjects = listInterfaces().find((i) => i.name === 'subjects');
        expect(subjects).toBeTruthy();
        expect(subjects!.declaredBy).toBe('subjects');   // 약속을 들고 온 꾸러미 = 채우는 꾸러미(같다)
        expect(subjects!.provider).toBe('subjects');
    });
});
