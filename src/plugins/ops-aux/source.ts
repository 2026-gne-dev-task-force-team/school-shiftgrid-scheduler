/** 근태 자료 창구 — 🔴 진짜 서버를 붙일 자리는 이 파일 한 곳이다. 지금은 메모리 가짜 어댑터. */
import type { DayLesson } from '../../../shared/aux-engine/assign.ts';
import type { Bundle } from '../../../shared/bundle/types.ts';
import { getBundle, subscribeBundle } from '../../../shared/bundle/store.ts';
import { lessonsFromBundle } from './lessons';
import type { AuxPart } from './types';

export interface AuxSource {
    load(): Promise<AuxPart>;
    /** `aux` 칸을 통째로 쓴다(권한·재배정 검사는 `applyAuxOps` 가 먼저 한다). */
    save(next: AuxPart): Promise<void>;
    /** 그날의 수업 칸 — 시간표·변경·학사일정에서 만들어 준다(이 판은 가짜). */
    lessonsOn(date: string): DayLesson[];
    /** 자료가 바뀌면 부른다(상태바 배지가 다시 센다). 부르는 쪽이 돌려받은 함수로 끈다. */
    subscribe?(fn: () => void): () => void;
}

/** 번들이 있으면 거기서 수업 칸을 만들고, 없거나 시간표가 비었을 때만 demo 로 떨어진다. */
export function lessonsOnOf(bundle?: Bundle | null): (date: string) => DayLesson[] {
    return lessonsFromBundle(bundle) ?? demoLessons;
}

export function memoryAuxSource(initial: AuxPart, lessonsOn: (date: string) => DayLesson[] = demoLessons): AuxSource {
    let part = structuredClone(initial);
    const subs = new Set<() => void>();
    return {
        load: async () => structuredClone(part),
        save: async (next) => { part = structuredClone(next); subs.forEach((f) => f()); },
        lessonsOn,
        subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    };
}

/** 기기 저장소 한 칸 — 호스트가 주는 플러그인별 저장(`host.storage`)에서 읽고 쓰는 두 손만 쓴다(localStorage 직접 접근 없음). */
export interface PartStore { get<T>(key: string, fallback: T): T; set(key: string, v: unknown): void }
export const PART_KEY = 'part';

/** 저장된 값이 근태 꼴이면 그것, 아니면 null. */
export function readStoredPart(store: Pick<PartStore, 'get'>): AuxPart | null {
    const p = store.get<AuxPart | null>(PART_KEY, null);
    return p && Array.isArray(p.staff) && Array.isArray(p.day) && Array.isArray(p.exceptions) ? p : null;
}

/**
 * 호스트 기기 저장소에 남는 창구 — 새로고침·다시 붙기에도 넣은 변경이 남는다.
 * 저장된 값이 없을 때만 seed(데모)를 쓴다. 값이 깨졌으면 seed 로 돌아가되 던지지 않는다.
 * 옛 `localStorage` 값은 기동 때 한 번 이 칸으로 옮긴다(`partmove.ts`).
 */
export function storageAuxSource(store: PartStore, seed: () => AuxPart, lessonsOn: (date: string) => DayLesson[] = demoLessons): AuxSource {
    const subs = new Set<() => void>();
    return {
        load: async () => structuredClone(readStoredPart(store) ?? seed()),
        save: async (next) => { store.set(PART_KEY, next); subs.forEach((f) => f()); },
        lessonsOn,
        subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
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

/** 앱 번들이 바뀌어도 상태바 배지가 다시 센다 — 창구 하나에 번들 구독을 더한다. */
const withBundle = (base: AuxSource): AuxSource => ({
    ...base,
    subscribe: (fn) => { const a = base.subscribe!(fn); const b = subscribeBundle(fn); return () => { a(); b(); }; },
});
const bundleLessons = (date: string) => lessonsOnOf(getBundle())(date);

/** 호스트 저장이 없을 때(시험·단독 그림) 쓰는 기본 창구 — 메모리만(수업 칸은 앱 번들에서, 번들이 없으면 demo). */
export const defaultAuxSource: AuxSource = withBundle(memoryAuxSource(demoAux(), bundleLessons));

/** 호스트 저장(`host.storage`)에 얹은 창구 — 같은 저장이면 같은 창구(화면·상태바 배지가 구독을 나눈다). */
const byStore = new WeakMap<object, AuxSource>();
export function auxSourceFor(store: PartStore): AuxSource {
    let src = byStore.get(store);
    if (!src) { src = withBundle(storageAuxSource(store, demoAux, bundleLessons)); byStore.set(store, src); }
    return src;
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
