/** 학사 자료 창구 — 🔴 진짜 서버를 붙일 자리는 이 파일 한 곳이다. 지금은 메모리 가짜 어댑터. */
import type { DaysPart } from './types';

export interface DaysSource {
    load(): Promise<DaysPart>;
    /** 두 칸을 통째로 쓴다(역할 검사는 서버 몫 — 화면 쪽은 `applyDaysOps` 가 먼저 막는다). */
    save(next: DaysPart): Promise<void>;
}

export function memoryDaysSource(initial: DaysPart): DaysSource {
    let part = structuredClone(initial);
    return {
        load: async () => structuredClone(part),
        save: async (next) => { part = structuredClone(next); },
    };
}

export function demoDays(): DaysPart {
    return {
        calendar: [
            { id: 'e1', date: '2026-11-16', endDate: '2026-11-16', kind: 'all', title: '개교기념일' },
            { id: 'e2', date: '2026-11-19', endDate: '2026-11-20', kind: 'event', title: '가을 체험학습' },
        ],
        changes: [{ id: 'c1', date: '2026-11-17', classKey: '3-2', period: 4, subject: '체육', note: '', createdBy: 'u-a' }],
    };
}
