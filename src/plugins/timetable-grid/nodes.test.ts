/**
 * 시간표 다리 — 우클릭 메뉴는 대상을 항목(commandArg.nodeId)에 싣는다 · 휴지통 판정은 nodes.isTrashed.
 */
import { describe, it, expect, vi } from 'vitest';
import { sheetMenu, initGridNodes, inTrash, SHEET_TYPE } from './nodes';
import type { NodesApi } from '../explorer/contracts/nodes';

describe('시간표 우클릭 메뉴', () => {
    it('모든 항목이 자기 시간표를 commandArg.nodeId 로 싣는다 — 뒤에 연 메뉴가 앞 메뉴 대상을 못 바꾼다', () => {
        const a = sheetMenu('sheet-A');
        const b = sheetMenu('sheet-B');
        const ids = (es: typeof a) => es.map((e) => (e as { commandArg?: { nodeId?: string } }).commandArg?.nodeId);
        expect(ids(a)).toEqual(['sheet-A', 'sheet-A']);
        expect(ids(b)).toEqual(['sheet-B', 'sheet-B']);
    });
});

describe('시간표 휴지통 판정', () => {
    it('inTrash 는 nodes.isTrashed 에 맡긴다(부모 사슬을 손으로 안 탄다)', () => {
        const isTrashed = vi.fn((id: string) => id === 'gone');
        const api = { byType: () => [], subscribe: () => ({ dispose() {} }), isTrashed, roots: { main: 'm', trash: 't' } } as unknown as NodesApi;
        const d = initGridNodes(api);
        expect(inTrash('gone')).toBe(true);
        expect(inTrash('live')).toBe(false);
        expect(isTrashed).toHaveBeenCalledWith('gone');
        d?.dispose();
        void SHEET_TYPE;
    });
});
