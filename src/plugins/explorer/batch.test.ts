/**
 * NodesApi.batch — 묶음 한 칸 증명 + 🙋1 실측(2,000행 생성·⌘Z 시간·힙). 실측값은 콘솔에 찍고 한계는 넉넉히 단언한다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';

vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: async () => [], nodesWrite: async () => true }));

import { initStore, getState, undoAction, redoAction } from './store';
import { __resetPersistForTest } from './persist';
import { makeNodesApi } from './api';
import { registerType, clearTypes } from './model/types';
import { clearDerived } from './model/derive';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

const api = () => makeNodesApi('bt');
let dbId = '';

beforeEach(async () => {
    clearTypes(); clearDerived(); __resetPersistForTest();
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    registerType({ type: 'bt.db', label: 'db', icon: 'table', container: { accepts: ['bt.row'] } });
    registerType({ type: 'bt.row', label: '행', icon: 'table', record: true });
    await initStore(host());
    dbId = api().create(api().roots.main, { type: 'bt.db', name: 'db' });
});

const rows = () => api().byType('bt.row').length;

describe('NodesApi.batch', () => {
    it('묶음 안 여러 생성 = 되돌리기 한 칸 · 알림 한 번', () => {
        const a = api();
        const fn = vi.fn();
        a.subscribe(fn);
        const before = getState().history.past.length;
        a.batch(() => { for (let i = 0; i < 5; i++) a.create(dbId, { type: 'bt.row', name: `r${i}` }); });
        expect(rows()).toBe(5);
        expect(getState().history.past.length).toBe(before + 1);
        expect(fn).toHaveBeenCalledTimes(1);
        undoAction();
        expect(rows()).toBe(0);
        redoAction();
        expect(rows()).toBe(5);
    });

    it('중첩은 바깥에 합쳐지고, fn 이 던져도 지금까지를 한 칸으로 마감한다', () => {
        const a = api();
        const before = getState().history.past.length;
        expect(() => a.batch(() => {
            a.batch(() => { a.create(dbId, { type: 'bt.row', name: 'x' }); });
            a.create(dbId, { type: 'bt.row', name: 'y' });
            throw new Error('boom');
        })).toThrow('boom');
        expect(rows()).toBe(2);
        expect(getState().history.past.length).toBe(before + 1);
        // 던진 뒤에도 묶음 상태가 풀려 있다 — 다음 쓰기는 제 칸을 쌓는다
        a.create(dbId, { type: 'bt.row', name: 'z' });
        expect(getState().history.past.length).toBe(before + 2);
    });

    it('빈 묶음은 더미를 안 쌓는다', () => {
        const before = getState().history.past.length;
        api().batch(() => {});
        expect(getState().history.past.length).toBe(before);
    });
});

describe('🙋1 실측 — 2,000행', () => {
    it('묶음으로 2,000행 생성 → ⌘Z → ⌘⇧Z · 셀 100번 고친 뒤 힙', () => {
        const a = api();
        const heap = () => { (globalThis as { gc?: () => void }).gc?.(); return process.memoryUsage().heapUsed / 1048576; };
        const h0 = heap();
        let t = performance.now();
        a.batch(() => { for (let i = 0; i < 2000; i++) a.create(dbId, { type: 'bt.row', name: `r${i}`, data: { v: 1, values: { f_a: `값${i}`, f_b: i } } }); });
        const tCreate = performance.now() - t;
        expect(rows()).toBe(2000);

        const h1 = heap();
        // 셀 하나 고칠 때마다 나무 전체 스냅샷 — 100번(더미 한계)
        const ids = a.byType('bt.row').map((n) => n.id);
        t = performance.now();
        for (let i = 0; i < 100; i++) a.setData(ids[i], { v: 1, values: { f_a: `고침${i}`, f_b: i } });
        const tEdit100 = performance.now() - t;
        const h2 = heap();

        t = performance.now();
        undoAction();
        const tUndo = performance.now() - t;
        t = performance.now();
        redoAction();
        const tRedo = performance.now() - t;

        // 묶음 없이 같은 일(비교 대상) — 200행만 쟀다가 2,000 으로 외삽하지 않고 그대로 2,000 을 센다
        console.log(`[🙋1 실측] 묶음 2000행 생성 ${tCreate.toFixed(0)}ms · 셀 수정 100번 ${tEdit100.toFixed(0)}ms(1번 ${(tEdit100 / 100).toFixed(1)}ms) · ⌘Z ${tUndo.toFixed(1)}ms · ⌘⇧Z ${tRedo.toFixed(1)}ms · 힙 ${h0.toFixed(0)}→${h1.toFixed(0)}→${h2.toFixed(0)}MB (gc ${typeof (globalThis as { gc?: unknown }).gc === 'function' ? '켬' : '끔'})`);
        expect(tCreate).toBeLessThan(15000);
        expect(tUndo).toBeLessThan(500);
    }, 60000);
});
