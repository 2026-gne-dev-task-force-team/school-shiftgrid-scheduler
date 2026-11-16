/** 고정·금지 화면 탭 개편(T-10co · R107) — 화면 모양이 바뀌어도 금지칸·고정 수업·잠금이 저장되는 결과는 그대로다 */
import { describe, it, expect } from 'vitest';
import { emptyDoc } from '../types/doc';
import { cycleBlock, addFixed, togglePinAt, blockStateAt } from './doc-ops';
import { modesFor, modeAfterTab, stepTarget, BLOCKS_TABS } from '../ui/screens/blocksNav';
import type { Doc } from '../types/doc';

const strip = (d: Doc) => ({
    wb: d.weeklyBlocks.map(({ id: _id, ...r }) => r),
    asg: d.assignments.map(({ id: _id, ...r }) => r),
});
const base = (): Doc => ({ ...emptyDoc(), tracks: [{ id: 't1', name: '1-1', specId: 's1' } as never] });

describe('금지칸·고정 수업·잠금 저장 결과(화면 개편 전과 같음)', () => {
    it('반 금지칸은 교시로, 교사·특별실 금지칸은 시각으로 저장되고 한 바퀴 돈다', () => {
        let d = base();
        d = cycleBlock(d, { kind: 'track', id: 't1' }, { dayIndex: 1, slotIndex: 2 });
        d = cycleBlock(d, { kind: 'agent', id: 'a1' }, { dayIndex: 0, from: '09:00', to: '09:40' });
        expect(strip(d).wb).toEqual([
            { name: '배정 불가', dayIndex: 1, slotIndex: 2, targets: [{ kind: 'track', id: 't1' }], soft: false, temp: false },
            { name: '배정 불가', dayIndex: 0, from: '09:00', to: '09:40', targets: [{ kind: 'agent', id: 'a1' }], soft: false, temp: false },
        ]);
        const t = { kind: 'track', id: 't1' } as const;
        const p = { dayIndex: 1, slotIndex: 2 };
        expect(blockStateAt(cycleBlock(d, t, p), t, p)).toBe('avoid');
        expect(blockStateAt(cycleBlock(cycleBlock(cycleBlock(d, t, p), t, p), t, p), t, p)).toBe('none');
    });
    it('고정 수업은 반 칸에 fixed 로 들어가고 잠금은 pinned 만 뒤집는다', () => {
        let d = addFixed(base(), { trackId: 't1', dayIndex: 0, slotIndex: 1 }, undefined, '창체');
        expect(strip(d).asg).toEqual([expect.objectContaining({ trackId: 't1', dayIndex: 0, slotIndex: 1, label: '창체', fixed: true })]);
        d = togglePinAt(d, d.assignments[0].id);
        expect(d.assignments[0].pinned).toBe(true);
        d = togglePinAt(d, d.assignments[0].id);
        expect(d.assignments[0].pinned).toBe(false);
    });
});

describe('탭·앞뒤 단추 규칙', () => {
    it('탭은 반·교사·특별실 순이고 고정 수업·잠금은 반 탭에서만 쓴다', () => {
        expect(BLOCKS_TABS).toEqual(['track', 'agent', 'resource']);
        expect(modesFor('track')).toEqual(['block', 'fixed', 'pin']);
        expect(modesFor('agent')).toEqual(['block']);
        expect(modesFor('resource')).toEqual(['block']);
    });
    it('교사·특별실 탭으로 가면 고정·잠금 방식은 금지칸으로 돌아간다', () => {
        expect(modeAfterTab('agent', 'pin')).toBe('block');
        expect(modeAfterTab('resource', 'fixed')).toBe('block');
        expect(modeAfterTab('track', 'pin')).toBe('pin');
    });
    it('이전·다음은 같은 탭 목록 안에서 움직이고 끝에서 멈춘다', () => {
        const ids = ['a', 'b', 'c'];
        expect(stepTarget(ids, 'b', -1)).toBe('a');
        expect(stepTarget(ids, 'b', 1)).toBe('c');
        expect(stepTarget(ids, 'a', -1)).toBeNull();
        expect(stepTarget(ids, 'c', 1)).toBeNull();
        expect(stepTarget([], '', 1)).toBeNull();
    });
});
