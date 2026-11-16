/** 학사 자료 창구 — 🔴 진짜 서버를 붙일 자리는 이 파일 한 곳이다. 지금은 메모리 가짜 어댑터. */
import type { ClassSubject } from './import/classImport';
import { canApplyClassSubjects, CLASS_SUBJECTS_DENIED } from './ops';
import type { DaysPart, DaysViewer } from './types';

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

const LS_KEY = 'plugin.ops-days.part';

/**
 * 기기 저장소(localStorage)에 남는 창구 — 새로고침·다시 붙기에도 넣은 변경·지운 변경이 남는다.
 * 저장된 값이 없을 때만 seed(데모)를 쓴다. 저장소가 죽거나 값이 깨졌으면 seed 로 돌아가되 던지지 않는다.
 */
export function localDaysSource(seed: () => DaysPart, key: string = LS_KEY): DaysSource {
    const read = (): DaysPart => {
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const p = JSON.parse(raw) as DaysPart;
                if (p && Array.isArray(p.calendar) && Array.isArray(p.changes)) return p;
            }
        } catch { /* 깨진 값·저장소 막힘 — seed */ }
        return seed();
    };
    return {
        load: async () => structuredClone(read()),
        save: async (next) => { try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* 조용히 */ } },
    };
}

/** 반영 — 담임 과목만 갈아 쓰고 나머지 칸은 서버 지금 값 그대로. */
/** 담임 과목 저장 — 권한표 `days.classSubjects` 가 아니면 쓰지 않고 거부 이유를 돌려준다(되면 null). */
export async function saveClassSubjects(src: DaysSource, next: ClassSubject[], viewer: DaysViewer): Promise<string | null> {
    if (!canApplyClassSubjects(viewer)) return CLASS_SUBJECTS_DENIED;
    await src.save({ ...(await src.load()), classSubjects: next });
    return null;
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
