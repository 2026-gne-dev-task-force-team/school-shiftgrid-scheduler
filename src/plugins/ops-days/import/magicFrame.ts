/** 시험 전용 — 비식별 마법학교 시간 틀. 1·2학년 · 3·4학년 · 5·6학년 세 틀, 반 여섯 개. 과목명은 가짜. */
import { TimeFrame, type FrameInput, type FrameSlot } from './frame';

const L = (idx: number, start: string, end: string, period: number): FrameSlot => ({ idx, start, end, label: `${period}교시`, assignable: true, kind: 'lesson' });
const LUNCH = (idx: number, start: string, end: string): FrameSlot => ({ idx, start, end, label: '점심', assignable: false, kind: 'lunch' });
// 1·2학년 · 5·6학년: 4교시 11:30, 점심 12:20 · 3·4학년: 점심 11:30, 4교시 12:20
const LOW = [L(0, '09:00', '09:40', 1), L(1, '09:50', '10:30', 2), L(2, '10:40', '11:20', 3), L(3, '11:30', '12:10', 4), LUNCH(4, '12:20', '13:00'), L(5, '13:10', '13:50', 5)];
const MID = [L(0, '09:00', '09:40', 1), L(1, '09:50', '10:30', 2), L(2, '10:40', '11:20', 3), LUNCH(3, '11:30', '12:10'), L(4, '12:20', '13:00', 4), L(5, '13:10', '13:50', 5)];

export const magicInput = (): FrameInput => ({
    tracks: [
        { name: '1-1', grade: 1, specKey: 'g12' },
        { name: '3-2', grade: 3, homeroomName: '교사01', specKey: 'g34' },
        { name: '3-4', grade: 3, homeroomName: '교사02', specKey: 'g34' },
        { name: '5-1', grade: 5, specKey: 'g56' },
    ],
    slots: { g12: LOW, g34: MID, g56: LOW },
    // 월요일: 1·2학년은 4교시까지(5교시 칸 없음). 나머지는 전부
    lessonsPerDay: { g12: { '0': 4 } },
    cells: [
        { trackName: '3-4', dayIndex: 0, idx: 0, specialist: true, subject: '빗자루비행' },
        { trackName: '5-1', dayIndex: 0, idx: 2, specialist: true, subject: '마법약' },
    ],
});
export const magicFrame = (): TimeFrame => new TimeFrame(magicInput());
