import { describe, expect, it } from 'vitest';
import { memorySource, type SubSlotRow, type Viewer } from '../list';
import { buildDetail, takeSlot, whyNotTake } from './detail';

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
