/**
 * 보조 인력 명부 → 교직원 명단(staff) 이사(R15 · T-10f4) — 한 번 돌고, 다시 돌려도 같은 결과.
 *   🔴 같은 꼴: 이름 = 노드 이름 · 구분(kind) = `assistant`(보조인력) · 세부(기초학력·한국어…)·단위·쉼 여부·허용 교과·대상 반은 보조 칸(`f_aux_*`)에 그대로.
 *   🔴 옛 명부(localStorage 근태 자료)는 지우지 않는다 — 옮김 표시 키(`<키>.moved`)만 더한다. 옛 id 는 `f_aux_id` 에 남겨 배정·마감이 가리키는 staffId 가 그대로 이어진다.
 *   🔴 두 번 돌려도 같음 — `f_aux_id` 가 이미 있는 사람은 건너뛴다.
 *   ⛔ NodesApi 하나로만(새 타입 이름은 글자로만 안다 · 남의 조각 값 import 금지). 월 마감·배정·조건은 ops-aux 에 남는다(결정).
 */
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Staff, StaffMember } from '../staff/contracts/staff';
import type { AuxKind, AuxPart, AuxStaff } from './types';

export const LS_KEY = 'plugin.ops-aux.part';
export const movedKeyOf = (key: string = LS_KEY): string => `${key}.moved`;

const LIST_TYPE = 'staff.list';
const MEMBER_TYPE = 'staff.member';
/** 이 명부가 옮겨 가는 명단 이름 — 같은 이름의 살아 있는 명단이 있으면 그걸 쓴다. */
export const AUX_LIST_NAME = '보조 인력';
/** 구분 칸(f_kind) 값 — 교직원 명단의 「보조인력」. */
export const AUX_KIND_VALUE = 'assistant';

const KINDS: readonly AuxKind[] = ['기초학력', '한국어', '디지털튜터', '자원봉사', '기타'];
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const valuesOf = (nodes: NodesApi, id: string): Record<string, unknown> => ((nodes.get(id)?.data as { values?: Record<string, unknown> } | undefined)?.values) ?? {};

/** AuxStaff → 교직원 노드 칸 값. */
export const auxToValues = (s: AuxStaff): Record<string, unknown> => ({
    f_kind: AUX_KIND_VALUE, memo: '',
    f_aux_id: s.id, f_aux_kind: s.kind, f_aux_unit: s.unit, f_aux_active: s.active,
    f_aux_activities: [...s.allowedActivities], f_aux_tracks: [...s.targetTracks],
});

/**
 * 옛 명부를 교직원 명단으로 옮긴다 — 새로 만든 수(이미 옮겨진 것은 안 센다), 두 번째부터는 0.
 *   staffUp = 교직원 명단(staff)이 켜져 있나 — 꺼져 있으면 0 으로 돌아온다(켜진 뒤 다시 돈다).
 */
export function migrateAuxStaffToStaff(nodes: NodesApi, staffRows: readonly AuxStaff[], staffUp: () => boolean = () => true): number {
    if (!staffUp() || staffRows.length === 0) return 0;
    const have = new Set(nodes.liveByType(MEMBER_TYPE).map((n) => valuesOf(nodes, n.id).f_aux_id).filter((x): x is string => typeof x === 'string'));
    const todo = staffRows.filter((s) => !have.has(s.id));
    if (todo.length === 0) return 0;
    let made = 0;
    nodes.batch(() => {
        const list = nodes.liveByType(LIST_TYPE).find((n) => n.name === AUX_LIST_NAME)?.id || nodes.create(nodes.roots.main, { type: LIST_TYPE, name: AUX_LIST_NAME, data: {} });
        if (!list) return;
        for (const s of todo) if (nodes.create(list, { type: MEMBER_TYPE, name: s.name, data: { values: clone(auxToValues(s)) } })) made++;
    });
    return made;
}

/** 근태 localStorage 자료의 명부를 옮기고 표시 키를 더한다 — 옛 값은 그대로. 읽을 게 없으면 0. */
export function moveLocalAuxStaff(nodes: NodesApi, storage: StorageLike, staffUp: () => boolean = () => true, key: string = LS_KEY): number {
    if (!staffUp()) return 0;
    let rows: AuxStaff[] = [];
    try {
        const raw = storage.getItem(key);
        const p = raw ? JSON.parse(raw) as Partial<AuxPart> : null;
        if (p && Array.isArray(p.staff)) rows = p.staff;
    } catch { /* 깨진 값 — 옮길 것 없음 */ }
    const made = migrateAuxStaffToStaff(nodes, rows, staffUp);
    try { storage.setItem(movedKeyOf(key), JSON.stringify({ staff: rows.length })); } catch { /* 표시를 못 써도 f_aux_id 가 두 번째 이사를 막는다 */ }
    return made;
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** 교직원 한 줄 → 근태 명부 한 줄(구분이 보조인력일 때만 · 아니면 undefined). 옛 id 가 있으면 그걸 id 로 쓴다. */
export function auxStaffOf(m: StaffMember): AuxStaff | undefined {
    if (m.kind !== AUX_KIND_VALUE) return undefined;
    const f = m.fields ?? {};
    const kind = KINDS.find((k) => k === f.f_aux_kind) ?? '기타';
    return {
        id: typeof f.f_aux_id === 'string' && f.f_aux_id ? f.f_aux_id : m.id,
        name: m.name, kind, unit: f.f_aux_unit === 'clock' ? 'clock' : 'period', active: f.f_aux_active !== false,
        allowedActivities: strs(f.f_aux_activities), targetTracks: strs(f.f_aux_tracks),
    };
}

/** 근태 화면이 읽는 보기 — staff 약속으로 모든 명단의 보조인력을 모은다(같은 id 는 한 번). */
export function readAuxStaff(staff: Staff): AuxStaff[] {
    const seen = new Set<string>();
    const out: AuxStaff[] = [];
    for (const l of staff.lists()) {
        for (const m of staff.staffIn(l.id)) {
            const a = auxStaffOf(m);
            if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); }
        }
    }
    return out;
}
