/**
 * W-X 두 탭 — 시트·시간표 자료(노드 data)가 탭 사이에 같게 가나(쥔님 *"두탭 똑같이 되도록 서로 어떤거 만져도 데이터는 똑같이 씽크되고"*).
 *   화면 실측(V-W 14a): A 에서 칸 입력 → B 에 안 보임 · A 를 새로고침하면 A 의 입력도 사라짐(낡은 사본이 덮음).
 *
 * ⭐ 꼴은 explorer/cross-tab-sync.test.ts 와 같다 — 탭 하나 = 모듈 그래프 하나(`vi.resetModules()`).
 *    공용은 IndexedDB(fake-indexeddb) · localStorage(Map) · BroadcastChannel(모의) 셋뿐.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory, IDBKeyRange as FakeKeyRange } from 'fake-indexeddb';
import type { PluginHost } from '../../pane-ui-system/plugin';

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

function minimalHost(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: {
            get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {},
            available: async () => true, estimate: async () => null,
        },
    } as unknown as PluginHost;
}

interface Tab {
    store: typeof import('../../pane-ui-system/core/node-store/store');
    persist: typeof import('../../pane-ui-system/core/node-store/persist');
    crossTab: typeof import('../../pane-ui-system/cross-tab');
    kv: typeof import('../../pane-ui-system/kv');
    sheet: typeof import('./nodes');
    grid: typeof import('../timetable-grid/nodes');
    bc: FakeBC;
}

async function openTab(): Promise<Tab> {
    vi.resetModules();
    const before = FakeBC.all.length;
    const store = await import('../../pane-ui-system/core/node-store/store');
    const persist = await import('../../pane-ui-system/core/node-store/persist');
    const crossTab = await import('../../pane-ui-system/cross-tab');
    const kv = await import('../../pane-ui-system/kv');
    const api = await import('../../pane-ui-system/core/node-frame/api');
    const sheet = await import('./nodes');
    const grid = await import('../timetable-grid/nodes');
    await store.initStore(minimalHost());
    sheet.initTableNodes(api.makeNodesApi('sheet'));
    grid.initGridNodes(api.makeNodesApi('timetable-grid'));
    const bc = FakeBC.all[before];
    expect(bc, '탭이 채널을 열었다').toBeTruthy();
    return { store, persist, crossTab, kv, sheet, grid, bc };
}

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
    for (const t of tabs) { t.persist.__resetPersistForTest(); t.crossTab.__resetCrossTabForTest(); }
    vi.unstubAllGlobals();
    vi.resetModules();
});

async function twoTabs(): Promise<[Tab, Tab]> {
    const a = await openTab();
    await a.persist.flushTree();
    const b = await openTab();
    tabs = [a, b];
    return [a, b];
}

/** 칸 하나 쓰기 — 화면(TableNodeView.onCommit)과 같은 길: applyTx(docOf(지금), tx) → writeDoc. */
function typeCell(t: Tab, id: string, r: number, key: string, value: string): void {
    const doc = t.sheet.docOf(id);
    t.sheet.writeDoc(id, t.sheet.applyTx(doc, { cells: [{ rowId: doc.rows[r].id, key, value }], source: 'edit' }));
}
const cellOf = (t: Tab, id: string, r: number, key: string) => t.sheet.docOf(id).rows[r]?.cells[key];

/** 저장소(IDB) 의 그 노드 data — 「새로고침하면 보일 값」. */
async function stored(t: Tab, id: string): Promise<unknown> {
    const all = (await t.kv.nodesGetAll()) ?? [];
    return (all.find((r) => (r as { id?: unknown }).id === id) as { data?: unknown } | undefined)?.data;
}

describe('W-X 두 탭 — 시트', () => {
    it('A 가 새 시트를 만들면 B 의 목록(시작 화면)에 새로고침 없이 보인다', async () => {
        const [a, b] = await twoTabs();
        const id = a.sheet.createTable()!;
        await a.persist.flushTree();
        await vi.waitFor(() => expect(b.sheet.liveTables().map((n) => n.id)).toContain(id));
    });

    it('A 가 칸을 쓰면 B 에 반영된다', async () => {
        const [a, b] = await twoTabs();
        const id = a.sheet.createTable()!;
        await a.persist.flushTree();
        await vi.waitFor(() => expect(b.sheet.tableNodeOf(id)).not.toBeNull());
        const key = a.sheet.docOf(id).cols[1].key;
        const rev0 = b.sheet.getTableRev();
        typeCell(a, id, 1, key, 'SYNCED');
        await a.persist.flushTree();
        await vi.waitFor(() => expect(cellOf(b, id, 1, key)).toBe('SYNCED'));
        expect(b.sheet.getTableRev(), 'B 화면 구독이 깨어났다').toBeGreaterThan(rev0);
    });

    it('🔴 B 의 낡은 사본(알림 전)이 다른 칸을 써도 A 의 칸을 덮지 않는다', async () => {
        const [a, b] = await twoTabs();
        const id = a.sheet.createTable()!;
        await a.persist.flushTree();
        await vi.waitFor(() => expect(b.sheet.tableNodeOf(id)).not.toBeNull());
        const [k0, k1] = a.sheet.docOf(id).cols.map((c) => c.key);

        b.bc.paused = true;                  // B 는 A 의 알림을 아직 못 받았다(늦은 탭)
        typeCell(a, id, 1, k0, 'A칸');
        await a.persist.flushTree();
        typeCell(b, id, 2, k1, 'B칸');       // B 는 낡은 문서 위에 다른 칸을 쓴다
        await b.persist.flushTree();
        b.bc.resume();
        await new Promise((r) => setTimeout(r, 30));

        const d = (await stored(a, id)) as { rows: { cells: Record<string, string> }[] };
        expect(d.rows[1].cells[k0], '🔴 A 의 입력이 저장소에서 사라졌다').toBe('A칸');
        expect(d.rows[2].cells[k1]).toBe('B칸');
        await vi.waitFor(() => expect(cellOf(a, id, 2, k1)).toBe('B칸'));
        await vi.waitFor(() => expect(cellOf(b, id, 1, k0)).toBe('A칸'));
    });
});

describe('W-X 두 탭 — 시간표', () => {
    it('A 가 칸을 쓰면 B 에 반영되고, B 의 낡은 사본이 A 를 덮지 않는다', async () => {
        const [a, b] = await twoTabs();
        const id = a.grid.createSheet()!;
        await a.persist.flushTree();
        await vi.waitFor(() => expect(b.grid.getSheetNodes().map((n) => n.id)).toContain(id));

        // 첫 쓰기(A) → B 반영
        a.grid.applyEdit(id, (d) => ({ ...d, cells: { ...d.cells, 'x:1': { text: 'A수업' } } }));
        await a.persist.flushTree();
        await vi.waitFor(() => expect(b.grid.sheetDataOf(id).cells['x:1']?.text).toBe('A수업'));

        // 늦은 B 가 다른 칸을 쓴다
        b.bc.paused = true;
        a.grid.applyEdit(id, (d) => ({ ...d, cells: { ...d.cells, 'x:2': { text: 'A둘' } } }));
        await a.persist.flushTree();
        b.grid.applyEdit(id, (d) => ({ ...d, cells: { ...d.cells, 'y:3': { text: 'B셋' } } }));
        await b.persist.flushTree();
        b.bc.resume();
        await new Promise((r) => setTimeout(r, 30));

        const d = (await stored(a, id)) as { cells: Record<string, { text: string }> };
        expect(d.cells['x:2']?.text, '🔴 A 의 입력이 저장소에서 사라졌다').toBe('A둘');
        expect(d.cells['y:3']?.text).toBe('B셋');
        await vi.waitFor(() => expect(a.grid.sheetDataOf(id).cells['y:3']?.text).toBe('B셋'));
        await vi.waitFor(() => expect(b.grid.sheetDataOf(id).cells['x:2']?.text).toBe('A둘'));
    });
});

describe('W-X2 탭이 가려지는/닫히는 중의 저장', () => {
    it('🔴 pagehide 로 바로 쓰는 낡은 탭도 상대 칸을 안 지운다(합치기가 쓰기 트랜잭션 안)', async () => {
        vi.stubGlobal('window', new EventTarget());    // bindFlush 가 pagehide 를 건다(탭마다)
        const [a, b] = await twoTabs();
        const id = a.grid.createSheet()!;
        await a.persist.flushTree();
        await vi.waitFor(() => expect(b.grid.getSheetNodes().map((n) => n.id)).toContain(id));

        b.bc.paused = true;                  // B 는 A 의 알림을 아직 못 받았다
        a.grid.applyEdit(id, (d) => ({ ...d, cells: { ...d.cells, 'x:1': { text: 'A칸' } } }));
        await a.persist.flushTree();
        b.grid.applyEdit(id, (d) => ({ ...d, cells: { ...d.cells, 'y:2': { text: 'B칸' } } }));
        window.dispatchEvent(new Event('pagehide'));   // B 가 디바운스를 기다리지 않고 바로 쓴다
        await b.persist.flushTree();

        const d = (await stored(a, id)) as { cells: Record<string, { text: string }> };
        expect(d.cells['x:1']?.text, '🔴 A 의 입력이 닫히는 탭의 저장에 지워졌다').toBe('A칸');
        expect(d.cells['y:2']?.text).toBe('B칸');
        b.bc.resume();
    });
});

describe('W-X2 시간표 ⌘Z 는 내가 바꾼 칸만', () => {
    it('🔴 A 칸1 · B 칸2 · A ⌘Z → 칸1 만 되돌고 칸2 는 B 값', async () => {
        const [a, b] = await twoTabs();
        const id = a.grid.createSheet()!;
        await a.persist.flushTree();
        await vi.waitFor(() => expect(b.grid.getSheetNodes().map((n) => n.id)).toContain(id));

        a.grid.applyEdit(id, (d) => ({ ...d, cells: { ...d.cells, 'x:1': { text: 'A칸' } } }));
        await a.persist.flushTree();
        await vi.waitFor(() => expect(b.grid.sheetDataOf(id).cells['x:1']?.text).toBe('A칸'));
        b.grid.applyEdit(id, (d) => ({ ...d, cells: { ...d.cells, 'y:2': { text: 'B칸' } } }));
        await b.persist.flushTree();
        await vi.waitFor(() => expect(a.grid.sheetDataOf(id).cells['y:2']?.text).toBe('B칸'));

        a.grid.stepEdit(id, 'undo');
        expect(a.grid.sheetDataOf(id).cells['x:1'], 'A 의 칸은 되돌았다').toBeUndefined();
        expect(a.grid.sheetDataOf(id).cells['y:2']?.text, '🔴 B 의 칸까지 되돌렸다').toBe('B칸');
        await a.persist.flushTree();
        const d = (await stored(a, id)) as { cells: Record<string, { text: string }> };
        expect(d.cells['y:2']?.text).toBe('B칸');
        expect(d.cells['x:1']).toBeUndefined();

        a.grid.stepEdit(id, 'redo');
        expect(a.grid.sheetDataOf(id).cells['x:1']?.text).toBe('A칸');
        expect(a.grid.sheetDataOf(id).cells['y:2']?.text).toBe('B칸');
    });
});
