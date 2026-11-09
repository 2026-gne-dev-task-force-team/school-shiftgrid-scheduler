/**
 * 「새로 만들기 ▸」 명령 자동 등록 증명(N4 반쪽 메꿈) — 쥔님 2026-11-02 *"새 달력 저장소 생성 안되노"*.
 *   메뉴는 등록 표를 돌아 explorer.new-<type> 를 부르는데 그 명령을 아무도 등록 안 해 떨어지던 것을 고쳤다.
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
import { registerTypeCommands, explorerPlugin } from './index';

const OWNER = 'explorer';

/** store(initStore·saveTree)용 최소 host — makeHost 의 real store.get 은 kvGet 을 타니(모킹 범위 밖) 여기선 안 쓴다. */
function storeHost(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

/** 명령 배선용 real host — 🔴 impl(explorerPlugin)을 함께 넣는다: registerTypeCommands 가 host.declare({impl:'newNode'})
 *   로 꽂으니 declareOne 이 그 이름을 commands 에서 찾는다(모듈 전역 레지스트리로 간다 — getCommand·runCommand 로 본다). */
function host(): PluginHost {
    return makeHost(OWNER, explorerPlugin);
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
        const cmd = getCommand('explorer.new-cal.store');
        expect(cmd?.title).toBe('새 달력 저장소');

        d.dispose();
        expect(getCommand('explorer.new-cal.store')).toBeUndefined();

        wiring.dispose();
    });

    it('① create 없는 타입(record 등)은 명령을 안 만든다', () => {
        const h = host();
        registerTypeCommands(h);
        registerType({ type: 'cal.event', label: '일정', icon: 'calendar', record: true });
        expect(getCommand('explorer.new-cal.event')).toBeUndefined();
    });

    it('② 활성(registerTypeCommands) 전에 이미 등록된 타입도 명령이 생긴다', () => {
        // 🔴 순서가 「달력이 먼저」 — 명령 배선을 걸기 전에 타입이 먼저 등록됐다.
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        registerType({
            type: 'cal.store', label: '달력 저장소', icon: 'calendar',
            container: { accepts: ['cal.event'] }, create: { label: '달력 저장소', under: ['folder'] },
        });
        const wiring = registerTypeCommands(host());   // 뒤늦게 배선

        expect(getCommand('explorer.new-folder')?.title).toBe('새 폴더');
        expect(getCommand('explorer.new-cal.store')?.title).toBe('새 달력 저장소');
        wiring.dispose();
    });

    it('④ new-folder 는 여전히 산다 — run 하면 루트 밑에 폴더가 생긴다', () => {
        const h = host();
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        const wiring = registerTypeCommands(h);

        const root = getState().tree.root;
        expect(getState().tree.nodes[root].children).toEqual([]);
        expect(runCommand('explorer.new-folder')).toBe(true);
        expect(getState().tree.nodes[root].children.length).toBe(1);

        wiring.dispose();
    });
});

describe('새 폴더 부모 경로 — 헤더(선택 기준)는 형제로, 우클릭(이 노드에서)은 그 안으로', () => {
    it('헤더 경로(via selection 기본) — 새 폴더 두 번 연속이면 둘 다 루트 직속(두 번째가 첫째 안에 안 들어간다)', () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        const root = getState().tree.root;

        newNode('folder');                       // 미선택 → 루트
        const id1 = getState().selectedId!;
        expect(parentOf(getState().tree, id1)).toBe(root);

        // id1 이 고른 채로 또 — 형제(루트)로, id1 안에 안 생긴다(쥔님 2026-11-02 *"안에 막 새폴더로 들어가지 않았던거 같은데"*)
        newNode('folder');
        const id2 = getState().selectedId!;
        expect(id2).not.toBe(id1);
        expect(parentOf(getState().tree, id2)).toBe(root);
        expect(getState().tree.nodes[id1].children).toEqual([]);
    });

    it('우클릭 경로(via context · targetId=폴더) — 그 폴더 안에 생긴다', () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        newNode('folder');
        const parent = getState().selectedId!;
        newNode('folder', { via: 'context', targetId: parent });
        const child = getState().selectedId!;
        expect(parentOf(getState().tree, child)).toBe(parent);
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

describe('만들기 → 열림(노션 방식) — 이름 정하기가 끝나면 그 노드를 연다', () => {
    function reg(opened: string[]) {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        registerType({ type: 'pg', label: '페이지', icon: 'file', openable: true, open: (id: string) => { opened.push(id); }, create: { label: '페이지' } });
    }
    it('이름 확정(Enter) 뒤에 열린다 — 만드는 순간엔 아직 안 열린다', async () => {
        const { commitRename } = await import('./store');
        const opened: string[] = [];
        reg(opened);
        newNode('pg');
        const id = getState().selectedId!;
        expect(opened).toEqual([]);
        commitRename('내 페이지');
        expect(opened).toEqual([id]);
    });
    it('이름 취소(Esc)여도 열린다 · 두 번 열리지 않는다', async () => {
        const { cancelRename, commitRename } = await import('./store');
        const opened: string[] = [];
        reg(opened);
        newNode('pg');
        const id = getState().selectedId!;
        cancelRename();
        expect(opened).toEqual([id]);
        commitRename('x');
        expect(opened).toEqual([id]);
    });
});
