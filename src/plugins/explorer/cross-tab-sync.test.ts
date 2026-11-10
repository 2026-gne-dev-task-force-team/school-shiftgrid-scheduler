/**
 * 두 탭 통합 검사(R3-X) — 쥔님 2026-11-10 *"두탭 똑같이 되도록 서로 어떤거 만져도 데이터는 똑같이 씽크되고 … 설정이나 데이터는 차이나면 안돼"*
 *
 * ⭐ 꼴: 탭 하나 = 모듈 그래프 하나. `vi.resetModules()` 뒤 다시 import 하면 store·persist·cross-tab·kv·테마가 새로 뜬다(탭 A·B).
 *    둘이 함께 보는 것만 공용으로 둔다 — IndexedDB(fake-indexeddb 한 개) · localStorage(Map 한 개) · BroadcastChannel(아래 모의).
 * 🔴 브라우저의 `storage` 이벤트는 「다른 탭」에만 온다 — 여기선 그 탭 cross-tab 의 dispatchStorageEvent 로 흉내 낸다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory, IDBKeyRange as FakeKeyRange } from 'fake-indexeddb';
import type { PluginHost } from '../../pane-ui-system/plugin';

/** BroadcastChannel 모의 — 같은 이름의 다른 인스턴스에 비동기로 나른다. paused 면 쌓아 뒀다 resume 때 나른다. */
class FakeBC {
    static all: FakeBC[] = [];
    onmessage: ((e: MessageEvent) => void) | null = null;
    paused = false;
    queue: unknown[] = [];
    name: string;
    constructor(name: string) { this.name = name; FakeBC.all.push(this); }
    postMessage(data: unknown) {
        for (const o of FakeBC.all) {
            if (o === this || o.name !== this.name) continue;
            const copy = structuredClone(data);
            setTimeout(() => o.receive(copy), 0);
        }
    }
    receive(data: unknown) {
        if (this.paused) { this.queue.push(data); return; }
        this.onmessage?.({ data } as MessageEvent);
    }
    resume() {
        this.paused = false;
        const q = this.queue; this.queue = [];
        for (const d of q) this.onmessage?.({ data: d } as MessageEvent);
    }
    close() { FakeBC.all = FakeBC.all.filter((x) => x !== this); }
}

const mem = new Map<string, string>();
const fakeLocalStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
};

/** 최소 host — 노드 스토어가 비었을 때 옛 자료 이사 입구만 빈 값으로 답한다. */
function minimalHost(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: {
            get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {},
            available: async () => true, estimate: async () => null,
        },
    } as unknown as PluginHost;
}

type Store = typeof import('./store');
type Persist = typeof import('./persist');
type CrossTab = typeof import('../../pane-ui-system/cross-tab');
type Kv = typeof import('../../pane-ui-system/kv');
type Theme = typeof import('../../pane-ui-system/theme/useTheme');
type ThemeSettingsMod = typeof import('../../pane-ui-system/theme/settings');
interface Tab {
    store: Store; persist: Persist; crossTab: CrossTab; kv: Kv; theme: Theme; themeSettings: ThemeSettingsMod;
    bc: FakeBC;
}

/** 탭 하나를 띄운다 — 새 모듈 그래프 + 탐색기 로드(→ DB 열기 → 채널 생성). */
async function openTab(): Promise<Tab> {
    vi.resetModules();
    const before = FakeBC.all.length;
    const store = await import('./store');
    const persist = await import('./persist');
    const crossTab = await import('../../pane-ui-system/cross-tab');
    const kv = await import('../../pane-ui-system/kv');
    const theme = await import('../../pane-ui-system/theme/useTheme');
    const themeSettings = await import('../../pane-ui-system/theme/settings');
    await store.initStore(minimalHost());
    const bc = FakeBC.all[before];
    expect(bc, '탭이 채널을 열었다').toBeTruthy();
    return { store, persist, crossTab, kv, theme, themeSettings, bc };
}

/** 저장소(IndexedDB)의 노드 레코드 — 탭 A 의 kv 로 읽는다(같은 DB). */
async function idbRecord(t: Tab, id: string): Promise<Record<string, unknown> | undefined> {
    const all = (await t.kv.nodesGetAll()) ?? [];
    return all.find((r) => (r as { id?: unknown }).id === id) as Record<string, unknown> | undefined;
}

const nameOf = (t: Tab, id: string) => t.store.getState().tree.nodes[id]?.name;

let tabs: Tab[] = [];

beforeEach(() => {
    mem.clear();
    FakeBC.all = [];
    tabs = [];
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('IDBKeyRange', FakeKeyRange);
    vi.stubGlobal('BroadcastChannel', FakeBC);
    vi.stubGlobal('localStorage', fakeLocalStorage);
});
afterEach(async () => {
    for (const t of tabs) { t.persist.__resetPersistForTest(); t.crossTab.__resetCrossTabForTest(); t.kv.__setTombGuardForTest(true); }
    vi.unstubAllGlobals();
    vi.resetModules();
});

async function twoTabs(): Promise<[Tab, Tab]> {
    const a = await openTab();
    await a.persist.flushTree();          // 첫 심기(빈 나무)가 저장소에 들어간 뒤 B 를 연다
    const b = await openTab();
    tabs = [a, b];
    return [a, b];
}

describe('R3-X 두 탭 — 자료는 같게', () => {
    it('A 가 노드를 만들면 B 에 보인다', async () => {
        const [a, b] = await twoTabs();
        const id = a.store.apiCreate('root', { type: 'folder', name: '새 폴더A' });
        expect(id).not.toBe('');
        await a.persist.flushTree();
        await vi.waitFor(() => expect(nameOf(b, id)).toBe('새 폴더A'));
        expect(b.store.getState().tree.nodes.root.children).toContain(id);   // 부모 자식 목록도 따라왔다
    });

    it('A 가 이름을 바꾸면 B 에 반영된다', async () => {
        const [a, b] = await twoTabs();
        const id = a.store.apiCreate('root', { type: 'folder', name: '처음' });
        await a.persist.flushTree();
        await vi.waitFor(() => expect(nameOf(b, id)).toBe('처음'));

        a.store.apiRename(id, '바꾼 이름');
        await a.persist.flushTree();
        await vi.waitFor(() => expect(nameOf(b, id)).toBe('바꾼 이름'));
    });

    it('B 에 편집 중(dirty) 칸이 있으면 덮지 않고, B 쓰기 뒤 다시 읽어 두 탭이 같아진다', async () => {
        const [a, b] = await twoTabs();
        const id = a.store.apiCreate('root', { type: 'folder', name: '처음' });
        await a.persist.flushTree();
        await vi.waitFor(() => expect(nameOf(b, id)).toBe('처음'));

        b.store.apiRename(id, 'B 편집');            // B 는 아직 저장 전(디바운스 중 = dirty)
        expect(b.persist.isPendingLocal(id)).toBe(true);
        a.store.apiRename(id, 'A 편집');
        await a.persist.flushTree();                 // A 가 먼저 저장소에 쓰고 알린다
        await new Promise((r) => setTimeout(r, 20)); // 알림이 B 에 닿을 시간
        expect(nameOf(b, id)).toBe('B 편집');        // 🔴 B 의 편집을 덮지 않았다

        const getAll = vi.spyOn(b.kv, 'nodesGetAll');
        await b.persist.flushTree();                 // B 가 쓴다 → 미뤄 둔 칸을 다시 읽는다
        await vi.waitFor(() => expect(getAll).toHaveBeenCalled());
        expect((await idbRecord(a, id))?.name).toBe('B 편집');   // 마지막 쓰기가 이겼다
        await vi.waitFor(() => expect(nameOf(a, id)).toBe('B 편집'));
        expect(nameOf(b, id)).toBe('B 편집');
    });

    it('A 가 영구삭제한 노드는 묘비 때문에 B 의 늦은 쓰기로 되살아나지 않는다', async () => {
        const [a, b] = await twoTabs();
        const id = a.store.apiCreate('root', { type: 'folder', name: '지울 것' });
        await a.persist.flushTree();
        await vi.waitFor(() => expect(nameOf(b, id)).toBe('지울 것'));

        b.bc.paused = true;                          // B 는 A 의 알림을 아직 못 받는다(늦은 탭)
        a.store.apiRemove(id);
        a.store.askPurge(id);
        a.store.purgeConfirmed();
        await a.persist.flushTree();
        expect(await idbRecord(a, id)).toBeUndefined();

        b.store.apiRename(id, '늦은 편집');          // B 의 낡은 사본이 그 노드를 쓴다
        await b.persist.flushTree();
        await new Promise((r) => setTimeout(r, 20));
        expect(await idbRecord(a, id), '🔴 저장소에 되살아났다').toBeUndefined();
        await vi.waitFor(() => expect(b.store.getState().tree.nodes[id]).toBeUndefined());   // 거부된 put → B 도 치웠다
        b.bc.resume();
        await new Promise((r) => setTimeout(r, 20));
        expect(a.store.getState().tree.nodes[id]).toBeUndefined();
        expect(b.store.getState().tree.nodes[id]).toBeUndefined();
    });
});

describe('R3-X 두 탭 — 설정은 같게', () => {
    it('A 에서 테마를 바꾸면 B 에 반영된다', async () => {
        const [a, b] = await twoTabs();
        const before = b.theme.getThemeSettings().mode;   // B 가 먼저 읽어 쥐고 있다(캐시)
        const next = before === 'dark' ? 'light' : 'dark';
        a.theme.setThemeSettings({ mode: next });
        const key = a.themeSettings.themeKey();
        expect(mem.get(key)).toBeTruthy();
        // 브라우저가 B 에 storage 이벤트를 쏜 것을 흉내
        b.crossTab.dispatchStorageEvent({ key, newValue: mem.get(key) ?? null });
        expect(b.theme.getThemeSettings().mode).toBe(next);
    });
});
