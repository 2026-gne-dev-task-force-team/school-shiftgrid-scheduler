import { describe, expect, it } from 'vitest';
import { memorySource, type SubSlotRow, type Viewer } from '../list';
import { buildDetail, cancelTake, takeSlot, whyNotCancel, whyNotTake } from './detail';

const mk = (id: string, track: string, startMin: number, endMin: number, absentRef: string, over: Partial<SubSlotRow> = {}): SubSlotRow => ({
    id, projectId: 'p1', date: '2026-11-12', trackName: track, startMin, endMin, status: '대기', createdAt: 't0', updatedAt: 't0',
    body: { absentRef, absentName: '가나다', registeredByName: '가짜올림', registeredBy: 'u-up', label: '', subject: null, reason: '연수', memo: '', allDay: false, preApproved: false },
    take: null, ...over,
});
const viewer = (o: Partial<Viewer> = {}): Viewer => ({ loggedIn: true, projectId: 'p1', userId: 'u-a', personRef: 'T-a', role: '교사', ...o });
const today = '2026-11-12';
const ctx = (extra = {}) => ({ today, now: () => 't1', takerName: '가짜전담', ...extra });

describe('QA 1 — 시각 겹침', () => {
    const first = mk('s1', '1-1', 580, 620, 'homeroom:1-1');   // 09:40~10:20
    const second = mk('s2', '3-1', 590, 630, 'homeroom:3-1');  // 09:50~10:30
    it('두 줄은 열쇠가 달라 따로 서고, 첫째를 맡은 뒤 둘째는 막힌다', async () => {
        const src = memorySource([first, second]);
        expect((await takeSlot(src, 's1', today, viewer(), ctx())).ok).toBe(true);
        const r = await takeSlot(src, 's2', today, viewer(), ctx());
        expect(r).toMatchObject({ ok: false, code: 409 });
        expect(!r.ok && r.message).toContain('같은 시각에 1-1 보결을 이미 맡았습니다');
        expect((await src.loadSlots(today)).find((x) => x.id === 's2')?.status).toBe('대기');
    });
    it('겹치지 않는 시각이면 둘 다 맡을 수 있다', async () => {
        const src = memorySource([first, mk('s3', '2-1', 640, 680, 'homeroom:2-1')]);
        await takeSlot(src, 's1', today, viewer(), ctx());
        expect((await takeSlot(src, 's3', today, viewer(), ctx())).ok).toBe(true);
    });
    it('다른 사람이 맡은 시각은 나와 상관없다', async () => {
        const src = memorySource([first, second]);
        await takeSlot(src, 's1', today, viewer({ userId: 'u-b', personRef: 'T-b' }), ctx());
        expect((await takeSlot(src, 's2', today, viewer(), ctx())).ok).toBe(true);
    });
});

describe('QA 2 — 선착순 맡기(동시성)', () => {
    it('같은 대기 건을 둘이 동시에 누르면 한 줄만 확정, 뒤 사람은 409', async () => {
        const src = memorySource([mk('s1', '1-1', 580, 620, 'homeroom:1-1')]);
        const a = viewer(); const b = viewer({ userId: 'u-b', personRef: 'T-b' });
        const seen = (await src.loadSlots(today))[0].updatedAt;
        const first = await takeSlot(src, 's1', today, a, ctx({ now: () => 'tA', expectUpdatedAt: seen }));
        const late = await takeSlot(src, 's1', today, b, ctx({ now: () => 'tB', expectUpdatedAt: seen }));
        expect(first.ok).toBe(true);
        expect(late).toMatchObject({ ok: false, code: 409 });
        const row = (await src.loadSlots(today))[0];
        expect(row.take?.takerRef).toBe('T-a'); expect(row.status).toBe('확정');
    });
    it('저장 순간에 줄이 바뀌면(ifMatch 어긋남) 409 되묻기', async () => {
        const base = memorySource([mk('s1', '1-1', 580, 620, 'homeroom:1-1')]);
        const racy = { ...base, saveSlot: async (r: SubSlotRow, o?: { ifMatch?: string | null }) => { await base.saveSlot({ ...r, updatedAt: 'other', status: '확정' }); return base.saveSlot(r, o); } };
        const r = await takeSlot(racy, 's1', today, viewer(), ctx());
        expect(r).toMatchObject({ ok: false, code: 409 });
        expect(!r.ok && r.message).toContain('먼저');
    });
});

describe('맡기 판정 · 상세 모양', () => {
    const row = mk('s1', '1-1', 580, 620, 'homeroom:1-1');
    it('지난 날 · 이미 확정 · personRef 없음 · 본인 결근은 막힌다', () => {
        expect(whyNotTake({ ...row, date: '2026-11-11' }, viewer(), today)?.code).toBe(409);
        expect(whyNotTake({ ...row, status: '확정' }, viewer(), today)?.code).toBe(409);
        expect(whyNotTake(row, viewer({ personRef: null }), today)?.code).toBe(403);
        expect(whyNotTake({ ...row, body: { ...row.body, absentRef: 'T-a' } }, viewer(), today)?.code).toBe(403);
        expect(whyNotTake(row, viewer(), today)).toBeNull();
    });
    it('오늘은 지난 날이 아니다', () => expect(whyNotTake(row, viewer(), '2026-11-12')).toBeNull());
    it('상세: 담임 결근 표시 · 시각 문구 · 감사 칸은 일반 교사에게 가려진다', () => {
        const d = buildDetail(row, viewer(), today)!;
        expect(d.absentKind).toBe('담임'); expect(d.timeText).toBe('09:40~10:20'); expect(d.canTake).toBe(true);
        expect(d.row.body.registeredBy).toBeNull();
        expect(buildDetail(row, viewer({ role: '교감' }), today)!.row.body.registeredBy).toBe('u-up');
    });
    it('다른 프로젝트·비로그인은 상세가 없다', () => {
        expect(buildDetail(row, viewer({ projectId: 'p2' }), today)).toBeNull();
        expect(buildDetail(row, viewer({ loggedIn: false }), today)).toBeNull();
    });
});

describe('QA 4 — 맡기 취소', () => {
    const taken = (over: Partial<SubSlotRow> = {}) => mk('s1', '1-1', 580, 620, 'homeroom:1-1', {
        status: '확정', updatedAt: 't0', take: { takerRef: 'T-a', takerName: '가짜전담', takerUserId: 'u-a', confirmedAt: 't0' }, ...over,
    });
    it('맡은 이가 취소하면 행은 남고 대기로 돌아가 다시 맡기가 열린다', async () => {
        const src = memorySource([taken()]);
        expect((await cancelTake(src, 's1', today, viewer(), ctx())).ok).toBe(true);
        const rows = await src.loadSlots(today);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: '대기', take: null });
        expect(whyNotTake(rows[0], viewer({ userId: 'u-b', personRef: 'T-b' }), today)).toBeNull();
    });
    it('남의 건은 일반 교사가 못 취소하고 관리 역할은 한다', async () => {
        const src = memorySource([taken()]);
        const other = await cancelTake(src, 's1', today, viewer({ userId: 'u-b', personRef: 'T-b' }), ctx());
        expect(other).toMatchObject({ ok: false, code: 403 });
        expect((await cancelTake(src, 's1', today, viewer({ userId: 'u-m', personRef: null, role: '교감' }), ctx())).ok).toBe(true);
    });
    it('지난 날은 관리자만 취소한다(본인·교감도 막힘)', () => {
        const old = taken({ date: '2026-11-11' });
        expect(whyNotCancel(old, viewer(), today)?.code).toBe(403);
        expect(whyNotCancel(old, viewer({ role: '교감' }), today)?.code).toBe(403);
        expect(whyNotCancel(old, viewer({ personRef: null, role: '관리자' }), today)).toBeNull();
    });
    it('대기 줄은 취소할 게 없다(409) · 상세의 canCancel 도 따라간다', () => {
        expect(whyNotCancel(mk('s2', '1-1', 580, 620, 'homeroom:1-1'), viewer(), today)?.code).toBe(409);
        expect(buildDetail(taken(), viewer(), today)!.canCancel).toBe(true);
        expect(buildDetail(taken(), viewer({ userId: 'u-b', personRef: 'T-b' }), today)!.canCancel).toBe(false);
    });
    it('동시 취소: 같은 줄을 둘이 누르면 하나만 되고 뒤는 409 되묻기', async () => {
        const src = memorySource([taken()]);
        const mgr = viewer({ userId: 'u-m', personRef: null, role: '교감' });
        const a = await cancelTake(src, 's1', today, viewer(), ctx({ now: () => 'tA', expectUpdatedAt: 't0' }));
        const b = await cancelTake(src, 's1', today, mgr, ctx({ now: () => 'tB', expectUpdatedAt: 't0' }));
        expect(a.ok).toBe(true);
        expect(b).toMatchObject({ ok: false, code: 409 });
    });
    it('저장 순간 줄이 바뀌면(ifMatch 어긋남) 409', async () => {
        const base = memorySource([taken()]);
        const racy = { ...base, saveSlot: async (r: SubSlotRow, o?: { ifMatch?: string | null }) => { await base.saveSlot({ ...r, updatedAt: 'other' }); return base.saveSlot(r, o); } };
        const r = await cancelTake(racy, 's1', today, viewer(), ctx());
        expect(r).toMatchObject({ ok: false, code: 409 });
        expect(!r.ok && r.message).toContain('먼저');
    });
});
