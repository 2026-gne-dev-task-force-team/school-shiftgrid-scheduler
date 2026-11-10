import { describe, expect, it } from 'vitest';
import { nextStepLine } from './nextStep';

const base = { hasStaff: true, staffFilled: false, sheets: 0, hasCalendar: true };
describe('nextStepLine — 지금 할 일 한 줄', () => {
    it('선생님 명단이 비었으면 명단부터', () => { expect(nextStepLine(base)).toBe('먼저 선생님 명단을 만드세요.'); });
    it('명단이 있고 시간표가 없으면 시간표 만들기', () => { expect(nextStepLine({ ...base, staffFilled: true })).toContain('시간표를 만드세요'); });
    it('시간표가 있으면 달력으로', () => { expect(nextStepLine({ ...base, staffFilled: true, sheets: 2 })).toContain('달력'); });
    it('명단 꾸러미가 꺼졌으면 그 걸음은 건너뛴다', () => { expect(nextStepLine({ ...base, hasStaff: false })).toContain('시간표를 만드세요'); });
    it('달력이 없으면 달력을 말하지 않는다', () => { expect(nextStepLine({ ...base, staffFilled: true, sheets: 1, hasCalendar: false })).not.toContain('달력'); });
});
