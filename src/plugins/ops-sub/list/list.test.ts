import { describe, it, expect } from 'vitest';
import { applyVisibility, groupByDateAndTime, mineOf, memorySource, type SubSlotRow, type Viewer } from './index';

const row = (id: string, over: Partial<SubSlotRow> & { absentRef?: string; takerRef?: string; by?: string; takerUser?: string | null } = {}): SubSlotRow => ({
    id, projectId: 'p1', date: '2026-11-12', trackName: '1-1', startMin: 540, endMin: 580, status: over.takerRef ? '확정' : '대기',
    createdAt: '', updatedAt: '',
    body: { absentRef: over.absentRef ?? 'homeroom:1-1', absentName: '가나다', registeredByName: '가짜올림', registeredBy: over.by ?? 'u-up', label: '', subject: null, reason: '연수', memo: '메모', allDay: false, preApproved: false },
    take: over.takerRef ? { takerRef: over.takerRef, takerName: '라마바', takerUserId: over.takerUser === undefined ? 'u-tk' : over.takerUser, confirmedAt: '' } : null,
    ...('date' in over ? { date: over.date } : {}), ...('trackName' in over ? { trackName: over.trackName } : {}), ...('startMin' in over ? { startMin: over.startMin, endMin: over.endMin } : {}),
    ...('projectId' in over ? { projectId: over.projectId } : {}),
} as SubSlotRow);

const viewer = (o: Partial<Viewer> = {}): Viewer => ({ loggedIn: true, projectId: 'p1', userId: 'u-x', personRef: 'T-x', role: '교사', ...o });

describe('공개 범위 표 — 줄마다', () => {
    const r = row('a', { takerRef: 'T-tk' });
    it('비로그인: 줄이 하나도 안 보인다', () => expect(applyVisibility([r], viewer({ loggedIn: false }))).toEqual([]));
    it('다른 프로젝트: 줄이 안 보인다', () => expect(applyVisibility([r], viewer({ projectId: 'p2' }))).toEqual([]));
    it('같은 프로젝트 일반 교사: 이름·사유·메모는 보인다', () => {
        const [v] = applyVisibility([r], viewer());
        expect(v.body.absentName).toBe('가나다'); expect(v.body.reason).toBe('연수'); expect(v.body.memo).toBe('메모'); expect(v.take?.takerName).toBe('라마바');
    });
    it('일반 교사: 올린 계정·누른 계정 id 는 가려진다', () => {
        const [v] = applyVisibility([r], viewer());
        expect(v.body.registeredBy).toBeNull(); expect(v.take?.takerUserId).toBeNull();
    });
    for (const role of ['관리자', '교감', '교무', '보결관리자'] as const) {
        it(`${role}: 감사 칸이 보인다`, () => {
            const [v] = applyVisibility([r], viewer({ role }));
            expect(v.body.registeredBy).toBe('u-up'); expect(v.take?.takerUserId).toBe('u-tk');
        });
    }
    it('올린 계정 본인: 감사 칸이 보인다', () => expect(applyVisibility([r], viewer({ userId: 'u-up' }))[0].body.registeredBy).toBe('u-up'));
    it('맡은 사람 본인: 감사 칸이 보인다', () => expect(applyVisibility([r], viewer({ personRef: 'T-tk' }))[0].take?.takerUserId).toBe('u-tk'));
    it('userId 없는 사용자는 올린 계정 null 과 우연히 같아지지 않는다', () => {
        const x = row('n', { by: '' });
        expect(applyVisibility([x], viewer({ userId: null }))[0].body.registeredBy).toBeNull();
    });
    it('지정·강제(누른 계정 null)도 관리자에겐 null 그대로', () => {
        const x = row('s', { takerRef: 'T-tk', takerUser: null });
        expect(applyVisibility([x], viewer({ role: '교감' }))[0].take?.takerUserId).toBeNull();
    });
});

describe('목록 — 날짜·시각별', () => {
    it('날짜 → 시작 시각 순, 같은 시각은 반 숫자 순, 시각이 다르면 다른 칸(교시 번호 아님)', () => {
        const rows = applyVisibility([
            row('1', { date: '2026-11-13' }),
            row('2', { trackName: '3-1', startMin: 590, endMin: 630 }),
            row('3', { trackName: '1-10' }),
            row('4', { trackName: '1-2' }),
        ], viewer());
        const g = groupByDateAndTime(rows);
        expect(g.map((d) => d.date)).toEqual(['2026-11-12', '2026-11-13']);
        expect(g[0].times.map((t) => t.startMin)).toEqual([540, 590]);
        expect(g[0].times[0].rows.map((r) => r.trackName)).toEqual(['1-2', '1-10']);
    });
    it('빈 입력은 빈 목록', () => expect(groupByDateAndTime([])).toEqual([]));
});

describe('내 것', () => {
    const rows = applyVisibility([
        row('t', { takerRef: 'T-me', absentRef: 'T-other' }),
        row('a', { absentRef: 'T-me', startMin: 590, endMin: 630 }),
        row('o', { takerRef: 'T-zz', absentRef: 'T-other', startMin: 600, endMin: 640 }),
    ], viewer());
    it('맡은 줄과 빠진 줄이 갈린다', () => {
        const m = mineOf(rows, 'T-me');
        expect(m.taking.map((r) => r.id)).toEqual(['t']); expect(m.absent.map((r) => r.id)).toEqual(['a']);
    });
    it('personRef 가 없으면 둘 다 빈다', () => expect(mineOf(rows, null)).toEqual({ taking: [], absent: [] }));
    it('이름이 같아도 personRef 가 다르면 내 것이 아니다', () => expect(mineOf(rows, 'T-zz').absent).toEqual([]));
});

describe('가짜 어댑터', () => {
    it('loadSlots 는 그 날짜 줄만 준다', async () => {
        const s = memorySource([row('1'), row('2', { date: '2026-11-13' })]);
        expect((await s.loadSlots('2026-11-12')).map((r) => r.id)).toEqual(['1']);
    });
});
