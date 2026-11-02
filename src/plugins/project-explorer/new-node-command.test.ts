/**
 * 「새로 만들기 ▸」 명령 자동 등록 증명(N4 반쪽 메꿈) — 쥔님 2026-11-02 *"새 달력 저장소 생성 안되노"*.
 *   메뉴는 등록 표를 돌아 project-explorer.new-<type> 를 부르는데 그 명령을 아무도 등록 안 해 떨어지던 것을 고쳤다.
 *   ① create 와 함께 등록하면 명령이 생기고, 해제하면 사라진다
 *   ② 활성(registerTypeCommands) 전에 이미 등록된 타입도 명령이 생긴다 — 「활성 전 등록분 한 번 돌기」가 지킨다(버그 심기 자리)
 *   ③ newNode 는 accepts 안 받는 부모를 피해 루트에 만든다(메뉴만 보고 뚫는 것을 store 가 막는다)
 *   ④ new-folder 는 여전히 산다(손 등록을 자동 등록으로 흡수 — 두 벌 금지)
 *
 *   🔴 store 가 비동기 로드라 노드 스토어(kv)를 메모리로 모킹하고 initStore 로 loading 을 푼다(record-node.test 와 같은 결).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (batch: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (batch.clear) store.clear();
        for (const v of batch.put ?? []) store.set(v.id as string, v);
        for (const id of batch.del ?? []) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { makeHost } from '../../pane-ui-system/plugin/host';
import { disposeOwner, getCommand, runCommand } from '../../pane-ui-system/plugin/store';
import { initStore, getState, newNode, select } from './store';
import { __resetPersistForTest } from './persist';
import { registerType, clearTypes } from './model/types';
import { clearDerived } from './model/derive';
import { parentOf } from './model/tree';
import { registerTypeCommands } from './index';

const OWNER = 'project-explorer';

/** store(initStore·saveTree)용 최소 host — makeHost 의 real store.get 은 kvGet 을 타니(모킹 범위 밖) 여기선 안 쓴다. */
function storeHost(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

/** 명령 배선용 real host — commands.add/run 이 모듈 전역 레지스트리로 간다(getCommand·runCommand 로 들여다본다). */
function host(): PluginHost {
    return makeHost(OWNER);
}

beforeEach(async () => {
    kv.store.clear(); kv.nodesWrite.mockClear();
    disposeOwner(OWNER);
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(storeHost());
});
afterEach(() => { disposeOwner(OWNER); __resetPersistForTest(); });

describe('new-<type> 명령 자동 등록 — create 가 있는 타입마다', () => {
    it('① create 와 함께 등록하면 명령이 생기고, 그 등록을 거두면 명령도 사라진다', () => {
        const h = host();
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        const wiring = registerTypeCommands(h);

        const d = registerType({
            type: 'cal.store', label: '달력 저장소', icon: 'calendar',
            container: { accepts: ['cal.event'] }, create: { label: '달력 저장소', under: ['folder'] },
        });
        const cmd = getCommand('project-explorer.new-cal.store');
        expect(cmd?.title).toBe('새 달력 저장소');

        d.dispose();
        expect(getCommand('project-explorer.new-cal.store')).toBeUndefined();

        wiring.dispose();
    });

    it('① create 없는 타입(record 등)은 명령을 안 만든다', () => {
        const h = host();
        registerTypeCommands(h);
        registerType({ type: 'cal.event', label: '일정', icon: 'calendar', record: true });
        expect(getCommand('project-explorer.new-cal.event')).toBeUndefined();
    });

    it('② 활성(registerTypeCommands) 전에 이미 등록된 타입도 명령이 생긴다', () => {
        // 🔴 순서가 「달력이 먼저」 — 명령 배선을 걸기 전에 타입이 먼저 등록됐다.
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        registerType({
            type: 'cal.store', label: '달력 저장소', icon: 'calendar',
            container: { accepts: ['cal.event'] }, create: { label: '달력 저장소', under: ['folder'] },
        });
        const wiring = registerTypeCommands(host());   // 뒤늦게 배선

        expect(getCommand('project-explorer.new-folder')?.title).toBe('새 폴더');
        expect(getCommand('project-explorer.new-cal.store')?.title).toBe('새 달력 저장소');
        wiring.dispose();
    });

    it('④ new-folder 는 여전히 산다 — run 하면 루트 밑에 폴더가 생긴다', () => {
        const h = host();
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        const wiring = registerTypeCommands(h);

        const root = getState().tree.root;
        expect(getState().tree.nodes[root].children).toEqual([]);
        expect(runCommand('project-explorer.new-folder')).toBe(true);
        expect(getState().tree.nodes[root].children.length).toBe(1);

        wiring.dispose();
    });
});

describe('newNode — accepts 안 받는 부모를 피해 루트에', () => {
    it('③ 고른 노드가 그 타입을 안 받으면(달력 저장소 안에 또 달력 저장소) 루트에 만든다', () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        registerType({
            type: 'cal.store', label: '달력 저장소', icon: 'calendar',
            container: { accepts: ['cal.event'] }, create: { label: '달력 저장소', under: ['folder'] },
        });
        const root = getState().tree.root;

        // 첫 저장소 — 미선택이라 루트 밑(루트=folder 가 받는다)
        newNode('cal.store');
        const id1 = getState().selectedId!;
        expect(parentOf(getState().tree, id1)).toBe(root);

        // 그 저장소를 고른 채로 또 — 저장소는 저장소를 안 받는다 → 루트로 피한다(그 안에 안 생긴다)
        select(id1);
        newNode('cal.store');
        const id2 = getState().selectedId!;
        expect(id2).not.toBe(id1);
        expect(parentOf(getState().tree, id2)).toBe(root);
        expect(getState().tree.nodes[id1].children).toEqual([]);
    });
});
