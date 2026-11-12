import { describe, expect, it } from 'vitest';
import { memorySource, type SubSlotRow, type Viewer } from '../list';
import { adminOptions, runAdmin } from './admin';

const mk = (id: string, date: string, over: Partial<SubSlotRow> = {}): SubSlotRow => ({
    id, projectId: 'p1', date, trackName: '1-1', startMin: 540, endMin: 580, status: '대기', createdAt: 't0', updatedAt: 't0',
    body: { absentRef: 'homeroom:1-1', absentName: '가나다', registeredByName: '가짜올림', registeredBy: 'u-up', label: '', subject: null, reason: '연수', memo: '', allDay: false, preApproved: false },
    take: null, ...over,
});
const taken = { takerRef: 'T-z', takerName: '가짜전담', takerUserId: null, confirmedAt: 't0' };
const viewer = (role: Viewer['role']): Viewer => ({ loggedIn: true, projectId: 'p1', userId: 'u-m', personRef: 'T-m', role });
const today = '2026-11-12'; const yesterday = '2026-11-11';
const ctx = (extra = {}) => ({ today, now: () => 't1', ...extra });

describe('확인창 — 되돌릴 수 없는 조작은 확인 없이 실행되지 않는다', () => {
    it('삭제: 확인 전엔 needConfirm 만 돌려주고 줄이 그대로다', async () => {
        const src = memorySource([mk('a', today)]);
        const r = await runAdmin(src, 'delete', 'a', today, viewer('교무'), ctx());
        expect(r).toMatchObject({ ok: false, needConfirm: true });
        expect((await src.loadSlots(today)).length).toBe(1);
    });
    it('삭제: confirmed 면 지워진다', async () => {
        const src = memorySource([mk('a', today)]);
        expect((await runAdmin(src, 'delete', 'a', today, viewer('교무'), ctx({ confirmed: true }))).ok).toBe(true);
        expect((await src.loadSlots(today)).length).toBe(0);
    });
    it('확정 되돌리기: 확인 전엔 그대로, 확인 후 대기로 돌아간다', async () => {
        const src = memorySource([mk('a', today, { status: '확정', take: taken })]);
        expect(await runAdmin(src, 'revert', 'a', today, viewer('교감'), ctx())).toMatchObject({ needConfirm: true });
        expect((await src.loadSlots(today))[0].status).toBe('확정');
        await runAdmin(src, 'revert', 'a', today, viewer('교감'), ctx({ confirmed: true }));
        expect((await src.loadSlots(today))[0]).toMatchObject({ status: '대기', take: null });
    });
    it('강제 지정: 맡길 사람이 비면 막고, 확인 전엔 저장 안 한다', async () => {
        const src = memorySource([mk('a', today)]);
        expect(await runAdmin(src, 'force', 'a', today, viewer('보결관리자'), ctx({ target: { ref: '', name: '' } }))).toMatchObject({ ok: false, code: 409 });
        expect(await runAdmin(src, 'force', 'a', today, viewer('보결관리자'), ctx({ target: { ref: 'T-k', name: '가짜지정' } }))).toMatchObject({ needConfirm: true });
        expect((await src.loadSlots(today))[0].status).toBe('대기');
    });
    it('확인 뒤 저장 사이 줄이 바뀌었으면 409', async () => {
        const src = memorySource([mk('a', today)]);
        const r = await runAdmin(src, 'delete', 'a', today, viewer('관리자'), ctx({ confirmed: true, expectUpdatedAt: 'old' }));
        expect(r).toMatchObject({ ok: false, code: 409 });
    });
});

describe('지난 날 줄', () => {
    const rows = () => [mk('p', yesterday, { status: '확정', take: taken })];
    it('관리자 아닌 관리 역할은 삭제·되돌리기가 막힌다', async () => {
        for (const role of ['교감', '교무', '보결관리자'] as const) {
            const src = memorySource(rows());
            expect(await runAdmin(src, 'delete', 'p', yesterday, viewer(role), ctx({ confirmed: true }))).toMatchObject({ ok: false, code: 403 });
            expect(await runAdmin(src, 'revert', 'p', yesterday, viewer(role), ctx({ confirmed: true }))).toMatchObject({ ok: false, code: 403 });
            expect((await src.loadSlots(yesterday)).length).toBe(1);
        }
    });
    it('관리자는 지난 날 줄도 지운다 · 오늘은 지난 날이 아니다', async () => {
        const src = memorySource([...rows(), mk('t', today)]);
        expect((await runAdmin(src, 'delete', 'p', yesterday, viewer('관리자'), ctx({ confirmed: true }))).ok).toBe(true);
        expect((await runAdmin(src, 'delete', 't', today, viewer('교무'), ctx({ confirmed: true }))).ok).toBe(true);
    });
    it('지정은 지난 날 불가 · 강제 지정은 지난 날 가능(감사: 누른 계정 null)', async () => {
        const src = memorySource([mk('p', yesterday)]);
        const t = { ref: 'T-k', name: '가짜지정' };
        expect(await runAdmin(src, 'assign', 'p', yesterday, viewer('교감'), ctx({ confirmed: true, target: t }))).toMatchObject({ ok: false, code: 409 });
        expect((await runAdmin(src, 'force', 'p', yesterday, viewer('보결관리자'), ctx({ confirmed: true, target: t }))).ok).toBe(true);
        expect((await src.loadSlots(yesterday))[0].take).toMatchObject({ takerRef: 'T-k', takerUserId: null });
    });
    it('버튼 목록: 교사는 없음 · 교무는 지난 날 삭제 없음', () => {
        const r = mk('p', yesterday, { status: '확정', take: taken });
        expect(adminOptions(r, viewer('교사'), today)).toEqual([]);
        expect(adminOptions(r, viewer('교무'), today)).toEqual([]);
        expect(adminOptions(r, viewer('관리자'), today)).toEqual(['delete', 'revert', 'assign', 'force'].filter((a) => a !== 'assign'));
    });
});
