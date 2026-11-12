import { describe, it, expect } from 'vitest';
import { memorySource } from '../list/source';
import type { SubSlotRow } from '../list/types';
import { registerSlot, validateInput, type RegisterCtx, type RegisterInput } from './register';

let n = 0;
const ctx = (): RegisterCtx => ({ projectId: 'p1', userId: 'u-up', userName: '가짜올림', now: () => `t${++n}`, newId: () => `id${n}` });
const input = (o: Partial<RegisterInput> = {}): RegisterInput => ({
    date: '2026-11-12', start: '09:40', end: '10:20', trackName: '1-1', absentRef: 'homeroom:1-1', absentName: '가나다', reason: '연수', memo: '', ...o,
});
const taken = (): SubSlotRow => ({
    id: 'old', projectId: 'p1', date: '2026-11-12', trackName: '1-1', startMin: 580, endMin: 620, status: '확정', createdAt: 'a', updatedAt: 'a',
    body: { absentRef: 'homeroom:1-1', absentName: '가나다', registeredByName: '가짜올림', registeredBy: 'u-up', label: '', subject: null, reason: '병가', memo: '', allDay: false, preApproved: false },
    take: { takerRef: 'T-1', takerName: '라마바', takerUserId: 'u-t', confirmedAt: 'a' },
});

describe('보결 등록', () => {
    it('새 줄 저장 — 대기 상태 · 시각은 분으로', async () => {
        const src = memorySource([]);
        const r = await registerSlot(src, input(), ctx());
        expect(r).toMatchObject({ ok: true, replaced: false });
        const [row] = await src.loadSlots('2026-11-12');
        expect(row).toMatchObject({ status: '대기', startMin: 580, endMin: 620, trackName: '1-1', take: null });
        expect(row.body.registeredBy).toBe('u-up');
    });
    it('같은 열쇠 → 되묻기, 저장은 그대로', async () => {
        const src = memorySource([taken()]);
        const r = await registerSlot(src, input({ reason: '새 사유' }), ctx());
        expect(r).toMatchObject({ needsConfirm: true });
        expect((await src.loadSlots('2026-11-12'))[0].body.reason).toBe('병가');
    });
    it('다른 반이나 다른 시작 시각은 되묻지 않는다', async () => {
        const src = memorySource([taken()]);
        expect(await registerSlot(src, input({ trackName: '1-2' }), ctx())).toMatchObject({ ok: true });
        expect(await registerSlot(src, input({ start: '10:30', end: '11:10' }), ctx())).toMatchObject({ ok: true });
    });
    it('overwrite 로 덮음 — 맡은 사람은 풀려 대기로', async () => {
        const src = memorySource([taken()]);
        const r = await registerSlot(src, input({ reason: '새 사유' }), ctx(), { overwrite: true });
        expect(r).toMatchObject({ ok: true, replaced: true });
        const rows = await src.loadSlots('2026-11-12');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: '대기', take: null });
        expect(rows[0].body.reason).toBe('새 사유');
    });
    it('맡은 사람 있는 줄 — 되묻기 문구에 그 사실', async () => {
        const r = await registerSlot(memorySource([taken()]), input(), ctx());
        expect('message' in r && r.message).toContain('라마바');
        expect('message' in r && r.message).toContain('이미 맡은');
    });
    it('맡은 사람 없는 줄 — 문구에 맡은 사람 얘기가 없다', async () => {
        const t = { ...taken(), status: '대기' as const, take: null };
        const r = await registerSlot(memorySource([t]), input(), ctx());
        expect('message' in r && r.message).not.toContain('이미 맡은');
    });
    it('되묻는 사이 줄이 바뀌면 덮기가 충돌로 막힌다', async () => {
        const base = memorySource([taken()]);
        const src = { ...base, saveSlot: (row: SubSlotRow, o?: { ifMatch?: string | null }) => base.saveSlot(row, o) };
        const first = await registerSlot(src, input(), ctx());
        expect(first).toMatchObject({ needsConfirm: true });
        await base.saveSlot({ ...taken(), id: 'other', updatedAt: 'b' });
        const stale = { ...src, loadSlots: async () => [taken()] };
        expect(await registerSlot(stale, input(), ctx(), { overwrite: true })).toMatchObject({ ok: false, conflict: true });
    });
    it('입력 검사 — 날짜·시각 꼴 · 순서 · 길이', () => {
        expect(validateInput(input())).toEqual([]);
        expect(validateInput(input({ date: '2026-02-30' }))).toHaveLength(1);
        expect(validateInput(input({ date: '11/12' }))).toHaveLength(1);
        expect(validateInput(input({ start: '9:40' }))).toHaveLength(1);
        expect(validateInput(input({ start: '25:00' }))).toHaveLength(1);
        expect(validateInput(input({ end: '09:40' }))).toHaveLength(1);
        expect(validateInput(input({ absentRef: '' }))).toHaveLength(1);
        expect(validateInput(input({ reason: 'ㄱ'.repeat(101) }))).toHaveLength(1);
        expect(validateInput(input({ memo: 'ㄱ'.repeat(301) }))).toHaveLength(1);
    });
    it('검사 실패면 저장 0', async () => {
        const src = memorySource([]);
        expect(await registerSlot(src, input({ start: 'x' }), ctx())).toMatchObject({ ok: false });
        expect(await src.loadSlots('2026-11-12')).toEqual([]);
    });
});
