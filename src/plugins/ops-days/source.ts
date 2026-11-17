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

/** 기기 저장소 한 칸 — 호스트가 주는 플러그인별 저장(`host.storage`)에서 읽고 쓰는 두 손만 쓴다(localStorage 직접 접근 없음). */
export interface PartStore { get<T>(key: string, fallback: T): T; set(key: string, v: unknown): void }
export const PART_KEY = 'part';

/** 저장된 값이 학사 꼴이면 그것, 아니면 null. */
export function readStoredPart(store: Pick<PartStore, 'get'>): DaysPart | null {
    const p = store.get<DaysPart | null>(PART_KEY, null);
    return p && Array.isArray(p.calendar) && Array.isArray(p.changes) ? p : null;
}

/**
 * 호스트 기기 저장소에 남는 창구 — 새로고침·다시 붙기에도 넣은 변경·지운 변경이 남는다.
 * 저장된 값이 없을 때만 seed(데모)를 쓴다. 값이 깨졌으면 seed 로 돌아가되 던지지 않는다.
 * 옛 `localStorage` 값은 기동 때 한 번 이 칸으로 옮긴다(`partmove.ts`).
 */
export function storageDaysSource(store: PartStore, seed: () => DaysPart): DaysSource {
    return {
        load: async () => structuredClone(readStoredPart(store) ?? seed()),
        save: async (next) => { store.set(PART_KEY, next); },
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
