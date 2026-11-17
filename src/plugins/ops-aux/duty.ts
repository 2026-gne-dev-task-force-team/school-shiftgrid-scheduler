/**
 * 근태 배정·예외 → 달력 프리셋 「근태」(R16 · T-10fr) — 프리셋 정의 + 옛 자료(호스트 저장 `part` 의 day·exceptions) 이사 + 달력에서 읽고 쓰기.
 *   🔴 옛 값은 지우지 않는다 — 「옮김」 표시(`duty.moved`)만 더한다. 일정 값에 `f_aux_id`(옛 줄 id)를 남겨 두 번 돌려도 겹쳐 만들지 않는다.
 *   🔴 월 마감(monthClose)·근무 조건(conditions)·기본 배정(base)·명부는 정본 후보가 없어 ops-aux 에 남는다(결정 🙋 ⑤). 서버 공유 `shared/ops-aux/month-lock.ts` 는 건드리지 않는다.
 *   🔴 남의 조각 값 import 금지 — 달력·노드는 약속 타입으로만, 저장소·일정 노드 타입 이름은 글자로만 안다.
 *   ⭐ 마감된 달의 배정·예외는 달력 쪽 저장(beforeSave)에서도 막는다 — 판정 글은 `month/judge` 의 같은 규칙(정정 예외 추가만 허용).
 */
import { toHHMM } from '../../../shared/clock.ts';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Calendar, CalendarPreset } from '../calendar/contracts/calendar';
import type { AuxDay, AuxException, AuxExceptionKind, AuxMonthClose, AuxPart } from './types';

export const PRESET_ID = 'ops-aux.duty';
export const TYPE_FIELD = 'f_type';
export const STAFF_FIELD = 'f_staff';
export const CLASS_FIELD = 'f_class';
export const SOURCE_FIELD = 'f_source';
export const EXKIND_FIELD = 'f_exkind';
export const AMOUNT_FIELD = 'f_amount';
export const AUXID_FIELD = 'f_aux_id';
export const DUTY_MOVED_KEY = 'duty.moved';
const STORE_TYPE = 'calendar.store';
const EVENT_TYPE = 'calendar.event';

export const TYPES = ['배정', '예외'] as const;
const EXKINDS: AuxExceptionKind[] = ['결근', '지각', '조퇴', '추가', '정정'];
const SOURCES = ['reassign', 'manual', 'none'] as const;

/** 마감 목록을 그때그때 읽어 주는 손 — 프리셋은 한 번 등록되고 마감은 바뀐다. */
export type ClosedLookup = () => readonly Pick<AuxMonthClose, 'staffId' | 'ym'>[];

/** 달력 쪽 저장 막기 — 마감된 (보조, 달)의 배정은 만들기·고치기·옮기기 모두 막고, 예외는 「정정」 만들기만 허용한다. */
export const dutyBeforeSave = (closed: ClosedLookup): NonNullable<CalendarPreset['beforeSave']> => (draft, ctx) => {
    const type = draft.values[TYPE_FIELD];
    const staffId = draft.values[STAFF_FIELD];
    if (typeof staffId !== 'string' || !staffId) return { ok: true };
    const ym = draft.start.slice(0, 7);
    if (!closed().some((m) => m.staffId === staffId && m.ym === ym)) return { ok: true };
    if (type === '예외') {
        if (ctx.kind === 'create' && draft.values[EXKIND_FIELD] === '정정') return { ok: true };
        return { ok: false, reason: `마감된 달(${ym})의 예외는 고치거나 지울 수 없습니다. 정정 예외로 더하세요.` };
    }
    if (type === '배정') return { ok: false, reason: `마감된 달(${ym})의 날짜별 배정은 고칠 수 없습니다. 정정 예외로 더하세요.` };
    return { ok: true };
};

export const dutyPreset = (closed: ClosedLookup): CalendarPreset => ({
    id: PRESET_ID,
    label: '근태',
    icon: 'users',
    words: { store: '근태 배정', event: '근태 일정', newEvent: '새 근태 일정', unit: '건' },
    defaultView: 'month',
    baseFields: [
        { key: TYPE_FIELD, label: '종류', type: 'select', options: TYPES.map((k) => ({ value: k, label: k })) },
        { key: STAFF_FIELD, label: '보조 id', type: 'text' },
        { key: CLASS_FIELD, label: '반', type: 'text' },
        { key: SOURCE_FIELD, label: '배정 출처', type: 'select', options: SOURCES.map((k) => ({ value: k, label: k })) },
        { key: EXKIND_FIELD, label: '예외 종류', type: 'select', options: EXKINDS.map((k) => ({ value: k, label: k })) },
        { key: AMOUNT_FIELD, label: '양(분)', type: 'number' },
        { key: AUXID_FIELD, label: '옛 줄 id', type: 'text' },
    ],
    beforeSave: dutyBeforeSave(closed),
});

/** 호스트 저장 한 칸(읽고 쓰기) — `host.storage` 의 모양. */
interface MarkStore { get<T>(key: string, fallback: T): T; set(key: string, v: unknown): void }
export interface DutyDeps { calendar: Calendar; nodes: NodesApi }
export interface DutyData { day: AuxDay[]; exceptions: AuxException[] }

const dutyStores = (nodes: NodesApi): string[] => nodes.liveByType(STORE_TYPE).filter((n) => (n.data as { preset?: unknown } | undefined)?.preset === PRESET_ID).map((n) => n.id);
export const firstDutyStore = (nodes: NodesApi): string | undefined => dutyStores(nodes)[0];
const valuesOf = (nodes: NodesApi, id: string): Record<string, unknown> => ((nodes.get(id)?.data as { values?: Record<string, unknown> } | undefined)?.values) ?? {};
const minOf = (when: string | undefined): number | null => { const m = /T(\d{2}):(\d{2})/.exec(when ?? ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const endClock = (min: number): string => (min >= 1440 ? '23:59' : toHHMM(min));

/** 배정 한 줄 → 달력 일정 값. */
const dayValues = (d: AuxDay): Record<string, unknown> => ({
    when: { start: `${d.date}T${toHHMM(d.startMin)}`, end: `${d.date}T${endClock(d.endMin)}` },
    [TYPE_FIELD]: '배정', [STAFF_FIELD]: d.staffId, [CLASS_FIELD]: d.classKey, [SOURCE_FIELD]: d.source, [AUXID_FIELD]: d.id,
});
/** 예외 한 줄 → 달력 일정 값(종일). */
const excValues = (e: AuxException): Record<string, unknown> => ({
    when: { start: e.date },
    [TYPE_FIELD]: '예외', [STAFF_FIELD]: e.staffId, [EXKIND_FIELD]: e.kind, [AMOUNT_FIELD]: e.amount, [AUXID_FIELD]: e.id,
    ...(e.note ? { memo: e.note } : {}),
});

/** 달력에서 읽은 배정·예외 — 근태 저장소가 없으면 null(이사 전이라 옛 자료로 읽는다). */
export function readDuty(nodes: NodesApi): DutyData | null {
    const stores = dutyStores(nodes);
    if (stores.length === 0) return null;
    const out: DutyData = { day: [], exceptions: [] };
    for (const s of stores) {
        for (const c of nodes.children(s)) {
            if (c.type !== EVENT_TYPE) continue;
            const v = valuesOf(nodes, c.id);
            const when = (v.when as { start?: string; end?: string } | undefined) ?? {};
            const id = typeof v[AUXID_FIELD] === 'string' && v[AUXID_FIELD] ? v[AUXID_FIELD] as string : c.id;
            const staffId = typeof v[STAFF_FIELD] === 'string' ? v[STAFF_FIELD] as string : '';
            const date = (when.start ?? '').slice(0, 10);
            if (v[TYPE_FIELD] === '배정') {
                const startMin = minOf(when.start) ?? 0;
                const endMin = when.end?.endsWith('T23:59') ? 1440 : (minOf(when.end) ?? startMin);
                const src = SOURCES.find((x) => x === v[SOURCE_FIELD]) ?? 'manual';
                out.day.push({ id, staffId, date, startMin, endMin, classKey: typeof v[CLASS_FIELD] === 'string' ? v[CLASS_FIELD] as string : '', source: src });
            } else if (v[TYPE_FIELD] === '예외') {
                const kind = EXKINDS.find((x) => x === v[EXKIND_FIELD]) ?? '정정';
                out.exceptions.push({ id, staffId, date, kind, amount: typeof v[AMOUNT_FIELD] === 'number' ? v[AMOUNT_FIELD] as number : 0, note: typeof v.memo === 'string' ? v.memo : '' });
            }
        }
    }
    return out;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 배정·예외를 달력에 맞춘다(없으면 만들고 · 달라졌으면 고치고 · 빠졌으면 휴지통으로). 저장소가 없으면 만든다 — 쓸 게 없고 저장소도 없으면 false. */
export function writeDuty(deps: DutyDeps, part: Pick<AuxPart, 'staff' | 'day' | 'exceptions'>): boolean {
    const { nodes } = deps;
    let store = firstDutyStore(nodes);
    if (!store) {
        if (part.day.length === 0 && part.exceptions.length === 0) return false;
        store = deps.calendar.newPresetStore(PRESET_ID);
        if (!store) return false;
    }
    const who = (id: string) => part.staff.find((s) => s.id === id)?.name ?? id;
    const want = new Map<string, { name: string; values: Record<string, unknown> }>();
    for (const d of part.day) want.set(d.id, { name: `${who(d.staffId)} ${toHHMM(d.startMin)} ${d.classKey || '지원 불가'}`, values: dayValues(d) });
    for (const e of part.exceptions) want.set(e.id, { name: `${who(e.staffId)} ${e.kind}`, values: excValues(e) });
    const have = new Map<string, string>();
    for (const c of nodes.children(store)) {
        if (c.type !== EVENT_TYPE) continue;
        const k = valuesOf(nodes, c.id)[AUXID_FIELD];
        if (typeof k === 'string' && k) have.set(k, c.id);
    }
    nodes.batch(() => {
        for (const [k, w] of want) {
            const nodeId = have.get(k);
            if (!nodeId) { nodes.create(store!, { type: EVENT_TYPE, name: w.name, data: { values: w.values } }); continue; }
            const now = nodes.get(nodeId);
            const cur = ((now?.data as { values?: Record<string, unknown> } | undefined)?.values) ?? {};
            const next = { ...Object.fromEntries(Object.entries(cur).filter(([k]) => k !== 'memo' || 'memo' in w.values)), ...w.values };
            if (!sameJson(cur, next)) nodes.setData(nodeId, { ...(now?.data as object), values: next });
        }
        for (const [k, nodeId] of have) if (!want.has(k)) nodes.remove(nodeId);
    });
    return true;
}

export function dutyMoved(marks: Pick<MarkStore, 'get'>): boolean { return marks.get<unknown>(DUTY_MOVED_KEY, null) !== null; }
export interface DutyMoveResult { moved: number; /** 이미 옮겨 둔 뒤라 아무것도 안 했다 */ done: boolean }

/**
 * 옛 배정·예외(호스트 저장 `part`)를 달력 일정으로 옮긴다 — 옛 값은 그대로. 표시는 일이 끝난 뒤(옮길 게 없어도) 쓴다 — 두 번째부터는 `done`.
 *   약속(calendar·nodes)이 꺼져 있으면 부르는 쪽(boot)이 미룬다(표시를 안 쓴다).
 */
export function moveDutyToCalendar(deps: DutyDeps, marks: MarkStore, old: Pick<AuxPart, 'staff' | 'day' | 'exceptions'> | null): DutyMoveResult {
    if (dutyMoved(marks)) return { moved: 0, done: true };
    let moved = 0;
    if (old && (old.day.length > 0 || old.exceptions.length > 0)) {
        const before = readDuty(deps.nodes);
        const have = new Set([...(before?.day ?? []), ...(before?.exceptions ?? [])].map((x) => x.id));
        const todo = { staff: old.staff, day: old.day.filter((d) => !have.has(d.id)), exceptions: old.exceptions.filter((e) => !have.has(e.id)) };
        // 이미 달력에 있는 것도 지우지 않도록, 있던 것까지 합쳐서 맞춘다.
        const merged = { staff: old.staff, day: [...(before?.day ?? []), ...todo.day], exceptions: [...(before?.exceptions ?? []), ...todo.exceptions] };
        if (todo.day.length + todo.exceptions.length > 0 && writeDuty(deps, merged)) moved = todo.day.length + todo.exceptions.length;
    }
    marks.set(DUTY_MOVED_KEY, { moved });
    return { moved, done: false };
}
