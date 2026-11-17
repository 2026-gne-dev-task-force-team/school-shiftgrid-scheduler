/**
 * 수요 줄 → 이름 풀기 — 🔴 정본 약속(staff·school·subjects)으로 **읽기만** 한다. 여기에 이름을 저장·복사하지 않는다.
 *   정본에 없는 id(지워졌거나 휴지통)는 name = null — 화면은 「찾을 수 없음」으로 보인다.
 *   정본 플러그인이 꺼져 있으면(약속 없음) 그 칸은 전부 null.
 */
import type { Staff } from '../staff/contracts/staff';
import type { School } from '../school/contracts/school';
import type { Subjects } from '../subjects/contracts/subjects';
import type { Rooms } from '../rooms/contracts/rooms';
import type { CollectionItem } from '../collection/contracts/collection';

export const NOT_FOUND = '찾을 수 없음';

/** 저장되는 수요 줄 — id 참조 셋 + 시수. 이름은 없다. */
export interface DemandRow {
    id: string;
    teacherId?: string;
    classId?: string;
    subjectId?: string;
    hours?: number;
    /** 선택 열(F4) — 그 열이 안 켜졌거나 비었으면 키가 없다. 공동 담당·특별실은 정본 id 만. */
    coTeacherId?: string;
    roomId?: string;
    block?: string;
    cycleSync?: true;
    biweekly?: true;
    pinned?: true;
}

/** 이름을 푼 보기용 — 칸의 id 가 비면 ref 없음(undefined), id 가 있는데 정본에 없으면 name null. */
export interface Ref { id: string; name: string | null }
export interface ResolvedDemand { id: string; teacher?: Ref; klass?: Ref; subject?: Ref; hours?: number; coTeacher?: Ref; room?: Ref }

/** rooms 는 선택 — 특별실 열이 켜진 학교만 읽는다(없으면 null·생략 = 방 이름을 못 푼다). */
export interface Canon { staff: Staff | null; school: School | null; subjects: Subjects | null; rooms?: Rooms | null }

const first = (v: unknown): string | undefined => {
    const id = Array.isArray(v) ? v[0] : v;
    return typeof id === 'string' && id !== '' ? id : undefined;
};

/** 컬렉션 항목 → 수요 줄(칸 값에서 id 참조만 뽑는다). */
export function toDemandRow(it: CollectionItem): DemandRow {
    const hours = it.values.f_hours;
    const block = it.values.f_block;
    return {
        id: it.id,
        teacherId: first(it.values.f_teacher),
        classId: first(it.values.f_class),
        subjectId: first(it.values.f_subject),
        ...(typeof hours === 'number' ? { hours } : {}),
        ...(first(it.values.f_cowork) ? { coTeacherId: first(it.values.f_cowork) } : {}),
        ...(first(it.values.f_room) ? { roomId: first(it.values.f_room) } : {}),
        ...(typeof block === 'string' && block.trim() !== '' ? { block: block.trim() } : {}),
        ...(it.values.f_cycle === true ? { cycleSync: true as const } : {}),
        ...(it.values.f_biweekly === true ? { biweekly: true as const } : {}),
        ...(it.values.f_pinned === true ? { pinned: true as const } : {}),
    };
}

function className(school: School | null, id: string): string | null {
    if (!school) return null;
    for (const y of school.years()) {
        const c = school.classesIn(y.id).find((x) => x.id === id);
        if (c) return c.name;
    }
    return null;
}

export function resolveDemand(row: DemandRow, canon: Canon): ResolvedDemand {
    const out: ResolvedDemand = { id: row.id };
    if (row.teacherId) out.teacher = { id: row.teacherId, name: canon.staff?.member(row.teacherId)?.name ?? null };
    if (row.classId) out.klass = { id: row.classId, name: className(canon.school, row.classId) };
    if (row.subjectId) out.subject = { id: row.subjectId, name: canon.subjects?.subject(row.subjectId)?.name ?? null };
    if (row.hours !== undefined) out.hours = row.hours;
    if (row.coTeacherId) out.coTeacher = { id: row.coTeacherId, name: canon.staff?.member(row.coTeacherId)?.name ?? null };
    if (row.roomId) out.room = { id: row.roomId, name: canon.rooms?.room(row.roomId)?.name ?? null };
    return out;
}

/** 보기 글자 — 못 찾으면 「찾을 수 없음」. */
export const refText = (r: Ref | undefined): string => (r ? r.name ?? NOT_FOUND : '');
