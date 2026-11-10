/**
 * 보관 받아들이기 — 모양이 틀린 저장값을 통째로 버리지 않고 살릴 만큼 살린다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getNotifications, __resetNotifyForTest } from '../plugin/notify';
import { __resetSettingsSaveFailForTest } from './save-fail';
import { normalizeRaw, hasWorkspace, loadWorkspace, saveWorkspace, clearWorkspace, workspaceKey } from './workspace-store';
import { flatten, emptyWorkspace, openLeaf, leaf } from './tree';

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

describe('R3-X 🙋15 — 배치는 탭마다(sessionStorage) · 새 탭은 마지막 배치(localStorage)로 시작', () => {
    const fakeArea = (m: Map<string, string>) => ({
        getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
        setItem: (k: string, v: string) => { m.set(k, String(v)); },
        removeItem: (k: string) => { m.delete(k); },
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('W15 레코드 탭 — params.recordId 가 저장·복원된다(새로고침·새 탭 배치 복원 뒤에도 그 레코드)', () => {
        const local = new Map<string, string>(); const sess = new Map<string, string>();
        vi.stubGlobal('localStorage', fakeArea(local)); vi.stubGlobal('sessionStorage', fakeArea(sess));
        let ws = openLeaf(emptyWorkspace(), leaf('collection.record', '가', { id: 'x1', params: { recordId: 'r1' } }));
        ws = openLeaf(ws, leaf('collection.record', '나', { id: 'x2', params: { recordId: 'r2', collectionId: 'c1' } }));
        saveWorkspace(ws);
        expect(flatten(loadWorkspace().center).map((l) => l.params)).toEqual([{ recordId: 'r1' }, { recordId: 'r2', collectionId: 'c1' }]);
        vi.stubGlobal('sessionStorage', fakeArea(new Map()));   // 새 탭 — 마지막 배치(localStorage)로 시작
        expect(flatten(loadWorkspace().center).map((l) => l.params?.recordId)).toEqual(['r1', 'r2']);
    });

    it('탭 A 의 저장이 이미 열린 탭 B 의 배치를 덮지 않고, 새 탭 C 는 마지막 배치로 시작한다', () => {
        const local = new Map<string, string>();           // 탭 공용
        const sessA = new Map<string, string>();            // 탭마다
        const sessB = new Map<string, string>();
        const sessC = new Map<string, string>();
        const asTab = (sess: Map<string, string>) => {
            vi.stubGlobal('localStorage', fakeArea(local));
            vi.stubGlobal('sessionStorage', fakeArea(sess));
        };

        asTab(sessB);
        saveWorkspace(openLeaf(emptyWorkspace(), leaf('v', 'B 문서', { id: 'b1' })));
        asTab(sessA);
        expect(flatten(loadWorkspace().center).map((l) => l.id)).toEqual(['b1']);   // 새 탭 A 는 마지막 배치(B 것)로 시작
        saveWorkspace(openLeaf(emptyWorkspace(), leaf('v', 'A 문서', { id: 'a1' })));

        asTab(sessB);
        expect(flatten(loadWorkspace().center).map((l) => l.id)).toEqual(['b1']);   // 🔴 B 는 제 배치를 지킨다
        asTab(sessC);
        expect(hasWorkspace()).toBe(true);
        expect(flatten(loadWorkspace().center).map((l) => l.id)).toEqual(['a1']);   // 새 탭 C 는 마지막 저장(A)

        clearWorkspace();                                    // 초기화는 이 탭 + 마지막 배치 둘 다
        expect(sessC.has(workspaceKey())).toBe(false);
        expect(local.has(workspaceKey())).toBe(false);
    });
});
