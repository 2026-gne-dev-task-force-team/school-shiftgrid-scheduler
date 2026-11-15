/** 근태 자료 창구 — 🔴 진짜 서버를 붙일 자리는 이 파일 한 곳이다. 지금은 메모리 가짜 어댑터. */
import type { DayLesson } from '../../../shared/aux-engine/assign.ts';
import type { AuxPart } from './types';

export interface AuxSource {
    load(): Promise<AuxPart>;
    /** `aux` 칸을 통째로 쓴다(권한·재배정 검사는 `applyAuxOps` 가 먼저 한다). */
    save(next: AuxPart): Promise<void>;
    /** 그날의 수업 칸 — 시간표·변경·학사일정에서 만들어 준다(이 판은 가짜). */
    lessonsOn(date: string): DayLesson[];
}

export function memoryAuxSource(initial: AuxPart, lessonsOn: (date: string) => DayLesson[] = demoLessons): AuxSource {
    let part = structuredClone(initial);
    return {
        load: async () => structuredClone(part),
        save: async (next) => { part = structuredClone(next); },
        lessonsOn,
    };
}

const L = (trackName: string, grade: number, startMin: number, subject: string, available = true): DayLesson =>
    ({ trackName, grade, label: '', startMin, endMin: startMin + 40, subject, available, ...(available ? {} : { unavailableReason: '체험학습' }) });

/** 평일 540(09:00)·590 두 칸. 2026-11-19 는 3-2 체험학습. */
export function demoLessons(date: string): DayLesson[] {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) return [];
    return [L('1-1', 1, 540, '국어'), L('3-2', 3, 540, '수학', date !== '2026-11-19'), L('1-1', 1, 590, '수학'), L('3-2', 3, 590, '국어', date !== '2026-11-19')];
}

export function demoAux(): AuxPart {
    return {
        staff: [
            { id: 's1', name: '강사01', kind: '기초학력', unit: 'clock', active: true, allowedActivities: ['국어', '수학'], targetTracks: ['1-1'] },
            { id: 's2', name: '튜터01', kind: '디지털튜터', unit: 'period', active: true, allowedActivities: [], targetTracks: [] },
        ],
        conditions: [{ id: 's1:3', staffId: 's1', dow: 3, workStartMin: 540, workEndMin: 630, periods: null }],
        base: [{ id: 's1:3:540', staffId: 's1', dow: 3, startMin: 540, endMin: 580, classKey: '1-1' }],
        day: [],
        exceptions: [],
        monthClose: [],
    };
}
