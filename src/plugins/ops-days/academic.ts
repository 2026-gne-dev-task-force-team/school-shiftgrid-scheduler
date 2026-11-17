/**
 * 학사 → 달력 프리셋 「학사」(R10 · T-10fb) — 프리셋 정의 + 옛 자료(localStorage DaysPart) 이사 + 달력에서 읽기.
 *   🔴 옛 값은 지우지 않는다 — 「옮김」 표시 키(`<키>.moved`)만 더한다. 표시를 지우면 다시 옮긴다(일정 노드엔 data.movedFrom 이 있어 겹쳐 만들지도 않는다).
 *   🔴 남의 조각 값 import 금지 — 달력·노드는 약속 타입으로만, 저장소·일정 노드 타입 이름은 글자로만 안다.
 *   ⭐ 담임 과목(classSubjects)은 옮기지 않는다 — ops-days 에 남는다. 편성 막힘(timetable-solver)은 ops-days 노드 타입을 읽지 않음(grep 확인).
 */
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Calendar, CalendarPreset } from '../calendar/contracts/calendar';
import type { CalendarEvent, DaysPart, TimetableChange } from './types';

export const LS_KEY = 'plugin.ops-days.part';
export const movedKeyOf = (key: string = LS_KEY): string => `${key}.moved`;
export const PRESET_ID = 'ops-days.academic';
export const KIND_FIELD = 'f_kind';
export const GRADE_FIELD = 'f_grade';
export const TTCHANGE_FIELD = 'f_ttchange';
const STORE_TYPE = 'calendar.store';
const EVENT_TYPE = 'calendar.event';

export const KINDS = ['휴업', '행사', '시험', '수업변경', '기타'] as const;
const GRADES = ['1', '2', '3', '4', '5', '6'];

export const ACADEMIC_PRESET: CalendarPreset = {
    id: PRESET_ID,
    label: '학사',
    icon: 'calendar',
    words: { store: '학사 일정', event: '학사 일정', newEvent: '새 학사 일정', unit: '건' },
    defaultView: 'month',
    baseFields: [
        { key: KIND_FIELD, label: '종류', type: 'select', options: KINDS.map((k) => ({ value: k, label: k })) },
        { key: GRADE_FIELD, label: '대상 학년', type: 'multi', options: GRADES.map((g) => ({ value: g, label: `${g}학년` })) },
        { key: TTCHANGE_FIELD, label: '시간표 변경', type: 'check' },
    ],
};

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export interface MoveDeps { calendar: Calendar; nodes: NodesApi }
export interface MoveResult { moved: number; /** 이미 옮겨 둔 뒤라 아무것도 안 했다 */ done: boolean }

export function isMoved(storage: StorageLike, key: string = LS_KEY): boolean {
    try { return storage.getItem(movedKeyOf(key)) !== null; } catch { return false; }
}

/** 옛 저장 값 — 없거나 깨졌으면 null. */
function readOld(storage: StorageLike, key: string): DaysPart | null {
    try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const p = JSON.parse(raw) as DaysPart;
        return p && Array.isArray(p.calendar) && Array.isArray(p.changes) ? p : null;
    } catch { return null; }
}

const academicStores = (nodes: NodesApi): string[] => nodes.liveByType(STORE_TYPE).filter((n) => (n.data as { preset?: unknown } | undefined)?.preset === PRESET_ID).map((n) => n.id);
const movedFrom = (nodes: NodesApi, store: string): Set<string> => new Set(nodes.children(store).map((c) => (c.data as { movedFrom?: unknown } | undefined)?.movedFrom).filter((x): x is string => typeof x === 'string'));

const eventValues = (e: CalendarEvent): Record<string, unknown> => ({
    when: e.endDate > e.date ? { start: e.date, end: e.endDate } : { start: e.date },
    [KIND_FIELD]: e.kind === 'all' ? '휴업' : '행사',
    [TTCHANGE_FIELD]: false,
});
const changeValues = (c: TimetableChange): Record<string, unknown> => ({
    when: { start: c.date },
    [KIND_FIELD]: '수업변경',
    [GRADE_FIELD]: /^\d/.test(c.classKey) ? [c.classKey[0]] : [],
    [TTCHANGE_FIELD]: true,
    ...(c.note ? { memo: c.note } : {}),
});

/** 옛 학사 일정·시간표 변경을 달력 일정으로 옮긴다. 표시 키는 일이 끝난 뒤(옮길 게 없어도) 쓴다 — 두 번째부터는 `done`. */
export function moveDaysToCalendar(deps: MoveDeps, storage: StorageLike, key: string = LS_KEY, current: DaysPart | null = null): MoveResult {
    if (isMoved(storage, key)) return { moved: 0, done: true };
    const old = current ?? readOld(storage, key);   // 호스트 저장(R12)에 값이 있으면 그것이 지금 값
    let moved = 0;
    if (old && (old.calendar.length > 0 || old.changes.length > 0)) {
        deps.nodes.batch(() => {
            const store = academicStores(deps.nodes)[0] || deps.calendar.newPresetStore(PRESET_ID);
            if (!store) return;
            const have = movedFrom(deps.nodes, store);
            const make = (srcId: string, name: string, values: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
                if (have.has(srcId)) return;
                if (deps.nodes.create(store, { type: EVENT_TYPE, name, data: { values, movedFrom: srcId, ...extra } })) { moved++; have.add(srcId); }
            };
            for (const e of old.calendar) make(`calendar:${e.id}`, e.title, eventValues(e));
            for (const c of old.changes) make(`changes:${c.id}`, `${c.classKey} ${c.period}교시 ${c.subject}`, changeValues(c), { change: { classKey: c.classKey, period: c.period, subject: c.subject, createdBy: c.createdBy } });
        });
    }
    try { storage.setItem(movedKeyOf(key), JSON.stringify({ moved })); } catch { /* 표시를 못 써도 data.movedFrom 이 두 번째 이사를 막는다 */ }
    return { moved, done: false };
}

/** 달력에서 읽은 학사 한 줄 — 보기용. */
export interface AcademicRow { id: string; date: string; name: string; kind: string; timetable: boolean }

const nextMonthStart = (month: string): string => {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01-01T00:00` : `${y}-${String(m + 1).padStart(2, '0')}-01T00:00`;
};

/** 그 달(YYYY-MM)의 학사 일정 — 학사 저장소가 없으면 null(달력 쪽으로 이사 전이라 옛 자료로 보인다). */
export function readAcademic(calendar: Calendar, nodes: NodesApi, month: string): AcademicRow[] | null {
    const stores = academicStores(nodes);
    if (stores.length === 0) return null;
    const rows: AcademicRow[] = [];
    for (const s of stores) {
        for (const o of calendar.occurrences(s, `${month}-01T00:00`, nextMonthStart(month))) {
            const n = nodes.get(o.eventId);
            const v = ((n?.data as { values?: Record<string, unknown> } | undefined)?.values) ?? {};
            rows.push({ id: o.eventId, date: o.start.slice(0, 10), name: n?.name ?? '', kind: typeof v[KIND_FIELD] === 'string' ? v[KIND_FIELD] as string : '', timetable: v[TTCHANGE_FIELD] === true });
        }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** 학사 저장소 하나(첫 것) — 「달력에서 열기」용. */
export const firstAcademicStore = (nodes: NodesApi): string | undefined => academicStores(nodes)[0];
