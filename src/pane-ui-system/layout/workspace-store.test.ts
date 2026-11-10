/**
 * 보관 받아들이기 — 모양이 틀린 저장값을 통째로 버리지 않고 살릴 만큼 살린다.
 */
import { describe, it, expect, vi } from 'vitest';
import { getNotifications, __resetNotifyForTest } from '../plugin/notify';
import { __resetSettingsSaveFailForTest } from './save-fail';
import { normalizeRaw, hasWorkspace, loadWorkspace, workspaceKey } from './workspace-store';
import { flatten } from './tree';

describe('normalizeRaw', () => {
    it('null·엉뚱한 값은 빈 배치', () => {
        expect(normalizeRaw(null).center.kind).toBe('tabs');
        expect(flatten(normalizeRaw('헛소리').center)).toEqual([]);
        expect(flatten(normalizeRaw(42).center)).toEqual([]);
    });

    it('성한 트리는 그대로 산다', () => {
        const raw = {
            left: null,
            center: { kind: 'tabs', id: 't1', children: [
                { kind: 'leaf', id: 'a', viewId: 'v', title: 'A' },
                { kind: 'leaf', id: 'b', viewId: 'v', title: 'B' },
            ], activeId: 'b' },
            right: null,
            floating: [],
        };
        const ws = normalizeRaw(raw);
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['a', 'b']);
        if (ws.center.kind === 'tabs') expect(ws.center.activeId).toBe('b');
    });

    it('망가진 칸은 떨구고 성한 것만 살린다', () => {
        const raw = {
            center: { kind: 'tabs', id: 't1', children: [
                { kind: 'leaf', id: 'ok', viewId: 'v', title: 'OK' },
                { kind: 'leaf', title: '아이디 없음' },        // id 없음 → 버림
                { kind: 'leaf', id: 'x' },                     // viewId 없음 → 버림
                '쓰레기',
            ], activeId: '없는것' },
            left: { kind: 'split', dir: 'row', id: 's1', children: [], sizes: [] },  // 빈 split → null
            floating: [{ kind: 'leaf', id: 'f', viewId: 'v', title: 'F' }, null],
        };
        const ws = normalizeRaw(raw);
        expect(flatten(ws.center).map((l) => l.id)).toEqual(['ok']);
        if (ws.center.kind === 'tabs') expect(ws.center.activeId).toBe('ok');  // 없는 activeId → 첫 자식
        expect(ws.left).toBeNull();
        expect(ws.floating.map((l) => l.id)).toEqual(['f']);
    });

    it('비율이 모양 틀린 split 도 살려 합을 1 로', () => {
        const raw = {
            center: {
                kind: 'split', id: 's', dir: 'col', sizes: [9],   // 길이 안 맞음
                children: [
                    { kind: 'tabs', id: 't1', children: [{ kind: 'leaf', id: 'a', viewId: 'v', title: 'A' }], activeId: 'a' },
                    { kind: 'tabs', id: 't2', children: [{ kind: 'leaf', id: 'b', viewId: 'v', title: 'B' }], activeId: 'b' },
                ],
            },
        };
        const ws = normalizeRaw(raw);
        expect(ws.center.kind).toBe('split');
        if (ws.center.kind === 'split') {
            expect(ws.center.sizes.length).toBe(2);
            expect(ws.center.sizes.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
        }
    });

    it('깨진 JSON 이나 비객체가 localStorage 에 들어 있으면 자동 삭제하고 hasWorkspace=false 로 복구한다', () => {
        const mem = new Map<string, string>();
        const prev = globalThis.localStorage;
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
                setItem: (k: string, v: string) => { mem.set(k, String(v)); },
                removeItem: (k: string) => { mem.delete(k); },
            },
        });
        try {
            mem.set(workspaceKey(), '{broken-json');
            expect(hasWorkspace()).toBe(false);
            expect(mem.has(workspaceKey())).toBe(false);

            mem.set(workspaceKey(), '"문자열"');
            expect(flatten(loadWorkspace().center)).toEqual([]);
            expect(mem.has(workspaceKey())).toBe(false);
        } finally {
            Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prev });
        }
    });

    it('깨진 값을 치우다 removeItem 이 실패하면 조용히 삼키지 않고 저장 실패 알림을 낸다(R3-U)', async () => {
        __resetNotifyForTest(); __resetSettingsSaveFailForTest();
        const prev = globalThis.localStorage;
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: { getItem: () => '{broken-json', setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } },
        });
        try {
            expect(hasWorkspace()).toBe(false);
            await vi.waitFor(() => expect(getNotifications().items.some((n) => n.key === 'settings-save:작업 공간 배치')).toBe(true));
        } finally {
            Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prev });
        }
    });
});
