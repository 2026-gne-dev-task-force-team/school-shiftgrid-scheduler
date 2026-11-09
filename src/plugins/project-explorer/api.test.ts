/**
 * 공개 API(N4) 검사 — 다른 플러그인이 받는 NodesApi 의 약속을 지키는지.
 *   ① register 접두사 거부 ② setData 주인 검사(🙋 3) ③ 유도 캐시/invalidate ④ 꺼진 뒤 모르는 타입 ⑤ 안 내보내는 것.
 *   🔴 모듈 전역(타입 등록소·스토어)이라 각 테스트가 먼저 비운다(clearTypes + initStore).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Node } from './model/tree';
import { makeNodesApi } from './api';
import { initStore } from './store';
import { getType, isKnownType, iconOf, emojiOf, clearTypes } from './model/types';
import { getDerived, invalidateDerived, clearDerived } from './model/derive';

/** 메모리 저장만 가진 가짜 호스트 — 스토어가 load/save 에 쓰는 것만 채운다.
 *   ⭐ store.available()=false 로 둔다 — 이 묶음은 kv 를 안 보고 host.storage(동기)로만 로드한다(빈 나무). */
function fakeHost(): PluginHost {
    const mem = new Map<string, unknown>();
    return {
        storage: {
            get: <T,>(k: string, f: T) => (mem.has(k) ? (mem.get(k) as T) : f),
            set: (k: string, v: unknown) => { mem.set(k, v); },
        },
        store: {
            get: async <T,>(_k: string, f: T) => f,
            set: async () => {},
            del: async () => {},
            available: async () => false,
            estimate: async () => null,
        },
    } as unknown as PluginHost;
}

beforeEach(async () => {
    clearTypes();
    clearDerived();
    await initStore(fakeHost());   // 🔴 로드가 끝나야(loading:false) 조작이 먹는다 — 비동기가 됐다
});

describe('① types.register — 접두사 강제', () => {
    it('`<caller>.` 로 시작하는 타입만 등록되고, 틀린 것은 거부(빈 Disposable)', () => {
        const api = makeNodesApi('pt');
        const bad = api.types.register({ type: 'wrong', label: '틀림', icon: 'file' });
        expect(getType('wrong')).toBeUndefined();
        expect(() => bad.dispose()).not.toThrow();   // 빈 Disposable 이라 안전

        const ok = api.types.register({ type: 'pt.sample', label: '샘플', icon: 'file' });
        expect(getType('pt.sample')?.label).toBe('샘플');
        ok.dispose();
        expect(getType('pt.sample')).toBeUndefined();
    });
});

describe('② setData — 그 타입을 등록한 플러그인만', () => {
    it('주인(타입 접두사 = 호출자)만 쓰고, 남이 쓰면 거부(값 안 바뀜)', () => {
        const owner = makeNodesApi('pt');
        owner.types.register({ type: 'pt.sample', label: '샘플', icon: 'file' });
        const id = owner.create(owner.roots.main, { type: 'pt.sample', name: '노드' });
        expect(id).not.toBe('');

        owner.setData(id, { v: 1 });
        expect(owner.get(id)?.data).toEqual({ v: 1 });

        const other = makeNodesApi('other');
        other.setData(id, { v: 2 });                     // 🔴 주인이 아니다 — 거부
        expect(owner.get(id)?.data).toEqual({ v: 1 });   // 그대로

        owner.setData(id, { v: 3 });                     // 주인은 다시 쓴다
        expect(owner.get(id)?.data).toEqual({ v: 3 });
    });

    it('내장(접두사 없는) 노드엔 setData 를 거부한다(data 주인이 없다)', () => {
        const api = makeNodesApi('pt');
        const id = api.create(api.roots.main, { type: 'folder', name: '폴더' });
        api.setData(id, { x: 1 });
        expect(api.get(id)?.data).toBeUndefined();
    });
});

describe('③ 유도 캐시 / invalidate', () => {
    it('getDerived 는 노드마다 한 번만 계산하고, invalidate 하면 다시 센다', () => {
        let calls = 0;
        const def = {
            type: 'pt.d', label: '유도', icon: 'folder' as const, container: true,
            derive: () => { calls += 1; return [{ key: 'a', name: 'A' }]; },
        };
        const node: Node = { id: 'n1', type: 'pt.d', name: 'N', children: [] };
        expect(getDerived(node, def).children).toHaveLength(1);
        getDerived(node, def);
        expect(calls).toBe(1);                 // 캐시 — 두 번째는 안 돈다
        invalidateDerived('n1');
        getDerived(node, def);
        expect(calls).toBe(2);                 // 버린 뒤엔 다시 돈다
    });

    it('derive 가 던지면 「유도 실패」로 접고(나무는 산다)', () => {
        const def = {
            type: 'pt.bad', label: '깨짐', icon: 'folder' as const, container: true,
            derive: () => { throw new Error('boom'); },
        };
        const node: Node = { id: 'nb', type: 'pt.bad', name: 'B', children: [] };
        const res = getDerived(node, def);
        expect(res.failed).toBe(true);
        expect(res.children).toEqual([]);
    });
});

describe('④ 타입 등록이 빠지면(플러그인 끄기) 노드는 남아 「모르는 타입」', () => {
    it('dispose 뒤 isKnownType=false · iconOf=file', () => {
        const api = makeNodesApi('pt');
        const d = api.types.register({ type: 'pt.sample', label: '샘플', icon: 'sparkles' });
        const id = api.create(api.roots.main, { type: 'pt.sample', name: '노드' });
        expect(isKnownType('pt.sample')).toBe(true);

        d.dispose();   // pane-test 가 꺼진 것과 같은 효과
        expect(isKnownType('pt.sample')).toBe(false);
        const n = api.get(id)!;
        expect(iconOf(n as Node)).toBe('file');   // 모르는 타입 → file
        expect(api.get(id)).toBeTruthy();         // 노드 자체는 남는다
    });
});

describe('④-2 노드별 이모지', () => {
    it('emoji 가 값을 주면 그 값 · 빈값/없음/모르는 타입은 undefined', () => {
        const api = makeNodesApi('pt');
        const d = api.types.register({ type: 'pt.e', label: 'E', icon: 'file', emoji: (n) => (n.data as { icon?: string } | undefined)?.icon });
        const id = api.create(api.roots.main, { type: 'pt.e', name: '노드' });
        expect(emojiOf(api.get(id) as Node)).toBeUndefined();
        api.setData(id, { icon: '🚀' });
        expect(emojiOf(api.get(id) as Node)).toBe('🚀');
        api.setData(id, { icon: '' });
        expect(emojiOf(api.get(id) as Node)).toBeUndefined();
        api.setData(id, { icon: '🚀' });
        d.dispose();
        expect(emojiOf(api.get(id) as Node)).toBeUndefined();
    });
});

describe('⑤ 공개 표면이 안 내주는 것 + 얼린 복사본', () => {
    it('purge·purgeAll·replaceTree 키가 없다', () => {
        const api = makeNodesApi('pt') as unknown as Record<string, unknown>;
        expect(api.purge).toBeUndefined();
        expect(api.purgeAll).toBeUndefined();
        expect(api.replaceTree).toBeUndefined();
    });

    it('get 은 얼린 복사본이라 바꿔도 나무에 안 샌다', () => {
        const api = makeNodesApi('pt');
        api.types.register({ type: 'pt.sample', label: '샘플', icon: 'file' });
        const id = api.create(api.roots.main, { type: 'pt.sample', name: '원래' });
        const n = api.get(id)!;
        expect(() => { (n as { name: string }).name = '바꿈'; }).toThrow();   // 얼려 있다
        expect(api.get(id)?.name).toBe('원래');
    });
});
