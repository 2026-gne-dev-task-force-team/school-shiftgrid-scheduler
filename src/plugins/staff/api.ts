/**
 * 🔴 staff 인터페이스 모듈 — manifest.provides.staff 와 짝. host.modules.use<Staff>('staff') 가 이걸 받는다.
 *   속은 컬렉션 kit(nodes.ts 가 쥔 것)로만 — 항목(칸 값) ↔ 약속의 StaffMember(이름·메모) 변환만 여기서 한다.
 *   ⛔ 호출자별 팩토리 아님 — 명단·사람은 누가 봐도 같다(저장·휴지통 주인은 노드 시스템이 쥔다).
 */
import type { CollectionItem } from '../collection/contracts/collection';
import type { Staff, StaffMember } from './contracts/staff';
import type { Disposable } from '../../pane-ui-system/plugin';
import { getKit } from './nodes';

/** 이 변환이 이름 붙여 따로 싣는 칸 — 나머지 사용자 칸은 fields(보조 칸)로 간다. */
const NAMED_KEYS = new Set(['name', 'memo', 'f_kind', 'f_tier', 'f_grades', 'f_subjects', 'f_homeroom', 'f_person']);

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);
const isEmpty = (v: unknown): boolean => v == null || v === '' || (Array.isArray(v) && v.length === 0);

function toMember(it: CollectionItem): StaffMember {
    const p: StaffMember = { id: it.id, listId: it.listId, name: it.name };
    const v = it.values;
    if (typeof v.memo === 'string' && v.memo !== '') p.memo = v.memo;
    if (typeof v.f_kind === 'string' && v.f_kind !== '') p.kind = v.f_kind;
    const tier = Number(v.f_tier);
    if (tier === 1 || tier === 2 || tier === 3) p.tier = tier;
    const grades = strList(v.f_grades).map(Number).filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
    if (grades.length) p.grades = grades;
    const subjects = strList(v.f_subjects);
    if (subjects.length) p.subjectIds = subjects;
    const rooms = strList(v.f_homeroom);
    if (rooms.length) p.homeroomClassIds = rooms;
    const extra: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (!NAMED_KEYS.has(k) && !isEmpty(val)) extra[k] = val;
    if (Object.keys(extra).length) p.fields = extra;
    if (it.ext) p.ext = it.ext;
    return p;
}

export const staffApi: Staff = {
    version: 1,
    lists: () => getKit()?.lists() ?? [],
    staffIn: (listId) => getKit()?.itemsIn(listId).map(toMember) ?? [],
    member: (id) => { const it = getKit()?.itemOf(id); return it ? toMember(it) : undefined; },
    addMember: (listId, input) => getKit()?.addItem(listId, { name: input.name, memo: input.memo ?? '' }) ?? '',
    updateMember: (id, patch) => {
        const k = getKit();
        if (patch.name !== undefined) k?.setValue(id, 'name', patch.name);
        if (patch.memo !== undefined) k?.setValue(id, 'memo', patch.memo);
    },
    removeMember: (id) => getKit()?.removeItem(id),
    moveMember: (id, listId, index) => getKit()?.moveItem(id, listId, index),
    onChange: (listener): Disposable => getKit()?.onChange(listener) ?? { dispose() { /* kit 없음 */ } },
};
