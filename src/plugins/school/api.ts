/**
 * 🔴 school 인터페이스 모듈 — manifest.provides.school 와 짝. 학교(노드 data) · 학년도·반(컬렉션 kit) → 약속 타입 변환만.
 */
import type { CollectionItem } from '../collection/contracts/collection';
import type { School, SchoolClass, SchoolInfo, SchoolLevel } from './contracts/school';
import type { Disposable } from '../../pane-ui-system/plugin';
import { getKit, getNodes, getRv, liveSchoolId } from './nodes';
import { LEVEL_OPTIONS } from './config';

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** 교실 칸 값 → 방 id — 반을 넣은 칸이면 그 반이 가리키는 방으로 따라간다(collection 약속). 약속이 없으면 값 그대로 */
function roomsOf(it: CollectionItem): string[] {
    const raw = Array.isArray(it.values.f_room) ? it.values.f_room.filter((x): x is string => typeof x === 'string') : [];
    const f = ((getNodes()?.get(it.listId)?.data as { fields?: { key: string; config?: unknown }[] } | undefined)?.fields ?? []).find((x) => x.key === 'f_room');
    return getRv()?.schema.resolveRelationTargets(raw, f?.config) ?? raw;
}

function toClass(it: CollectionItem): SchoolClass {
    const v = it.values;
    const c: SchoolClass = {
        id: it.id, yearId: it.listId, name: it.name,
        rooms: roomsOf(it),
        special: v.special === true,
    };
    const grade = num(v.grade); if (grade !== undefined) c.grade = grade;
    const no = num(v.no); if (no !== undefined) c.no = no;
    if (typeof v.memo === 'string' && v.memo !== '') c.memo = v.memo;
    return c;
}

export const schoolApi: School = {
    version: 1,
    school: () => {
        const id = liveSchoolId(); const n = id ? getNodes()?.get(id) : undefined;
        if (!n) return undefined;
        const values = ((n.data as { values?: Record<string, unknown> } | null)?.values) ?? {};
        const s: SchoolInfo = { id: n.id, name: n.name };
        if (LEVEL_OPTIONS.some((o) => o.value === values.level)) s.level = values.level as SchoolLevel;
        if (typeof values.memo === 'string' && values.memo !== '') s.memo = values.memo;
        return s;
    },
    years: () => getKit()?.lists() ?? [],
    classesIn: (yearId) => getKit()?.itemsIn(yearId).map(toClass) ?? [],
    onChange: (listener): Disposable => getNodes()?.subscribe(() => listener()) ?? { dispose() { /* 노드 다리 없음 */ } },
};
