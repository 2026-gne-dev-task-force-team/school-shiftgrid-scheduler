/**
 * 관계 칸의 「캐스팅」 — 방 목록 A 를 가리키는 칸에 다른 목록 B 의 줄(예: 반)을 넣는다. 순수 함수만(노드는 RelationLook 로 본다).
 *   판정: B 에 A 를 가리키는 관계 칸이 없으면 block · 그 줄이 A 의 줄을 하나 가리키면 direct · 여럿이면 pick · 비었으면 empty.
 *   🔴 값 꼴 — 칸 값은 그대로 string[] 이다. 원소 = 「대상 줄 id」(옛 값 그대로) | 「B 줄 id」 | 「B 줄 id>고른 대상 줄 id」.
 *     넣은 줄(반)은 그대로 들어가고, 여러 방 중 고른 것은 넣은 칸 쪽 원소의 `>` 뒤에 적는다(반 쪽은 안 고친다). 노드 id 는 영숫자라 `>` 와 안 겹친다.
 *   읽는 쪽은 resolveRelationTargets 로 「반 → 방」을 따라간 대상 줄 id 를 받는다(한 단계만 — 넣은 줄의 관계 칸 값은 대상 줄 id 로 본다).
 */
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import type { RecordField } from '../contracts/collection';
import { DB_TYPE, ROW_TYPE, normalizeRelation } from '../schema';
import { kitOfType } from '../kits';

/** 노드 시스템에서 관계 칸이 쓰는 것만 — 시험은 가짜로 채운다 */
export type RelationLook = Pick<NodesApi, 'get' | 'isTrashed' | 'path' | 'liveByType' | 'children' | 'parent' | 'find'>;
export type CastKind = 'block' | 'direct' | 'pick' | 'empty';

const SEP = '>';
export const parseRelationEntry = (s: string): { id: string; via?: string } => {
    const i = s.indexOf(SEP);
    return i < 0 ? { id: s } : { id: s.slice(0, i), ...(s.slice(i + 1) ? { via: s.slice(i + 1) } : {}) };
};
export const relationEntry = (id: string, via?: string): string => (via ? `${id}${SEP}${via}` : id);

/**
 * 대상 컬렉션의 레코드 — 범용 컬렉션(collection.db)은 행이 노드 나무로 중첩되고(하위 항목),
 *   defineCollection 컬렉션(꾸러미가 정의한 목록 노드)은 레코드가 목록 노드의 납작한 자식이고 중첩은 data.parentId 다.
 *   shortcut: 납작한 쪽은 「목록의 살아 있는 직속 자식 = 레코드」로 본다(record 타입 표를 노드 약속이 안 드러내서) — 목록에 레코드 아닌 자식이 생기면 타입 표 조회로 바꾼다.
 */
export function recordsOf(look: RelationLook, dbId: string): { id: string; name: string; parentId?: string }[] {
    if (look.get(dbId)?.type === DB_TYPE) {
        return look.liveByType(ROW_TYPE).filter((n) => look.path(n.id).includes(dbId)).map((n) => ({ id: n.id, name: n.name }));
    }
    if (!look.get(dbId) || look.isTrashed(dbId)) return [];
    return look.children(dbId).filter((n) => !look.isTrashed(n.id)).map((n) => {
        const p = (n.data as { parentId?: unknown } | undefined)?.parentId;
        return { id: n.id, name: n.name, parentId: typeof p === 'string' && p ? p : undefined };
    });
}

/** 이 id 가 대상 컬렉션 안에 살아 있는 레코드인가 */
export function liveIn(look: RelationLook, dbId: string, id: string): boolean {
    const n = look.get(id);
    if (!n || look.isTrashed(id)) return false;
    if (look.get(dbId)?.type === DB_TYPE) return n.type === ROW_TYPE && look.path(id).includes(dbId);
    return look.parent(id) === dbId && !look.isTrashed(dbId);
}

/** 레코드가 든 컬렉션 노드 — 범용 행이면 가장 가까운 collection.db 조상, 아니면 부모 */
export function ownerOf(look: RelationLook, id: string): string | null {
    if (look.get(id)?.type !== ROW_TYPE) return look.parent(id);
    const p = look.path(id);
    for (let i = p.length - 2; i >= 0; i--) if (look.get(p[i])?.type === DB_TYPE) return p[i];
    return null;
}

/** 컬렉션의 칸 — 노드에 저장된 사용자 칸 + (defineCollection 목록이면) 꾸러미 기본 칸(baseFields) */
const fieldsOf = (look: RelationLook, collId: string): RecordField[] => {
    const f = (look.get(collId)?.data as { fields?: unknown } | undefined)?.fields;
    const user = Array.isArray(f) ? (f as RecordField[]) : [];
    const base = kitOfType(look.get(collId)?.type)?.config.baseFields ?? [];
    return base.length ? [...base, ...user.filter((u) => !base.some((b) => b.key === u.key))] : user;
};
const pointsAt = (f: RecordField, targetDb: string): boolean => {
    const t = (f.config as { target?: { kind?: unknown; nodeId?: unknown } } | undefined)?.target;
    return f.type === 'relation' && t?.kind === 'db' && t.nodeId === targetDb;
};
const valuesOf = (look: RelationLook, id: string): Record<string, unknown> =>
    ((look.get(id)?.data as { values?: Record<string, unknown> } | undefined)?.values) ?? {};

/** 그 레코드의 컬렉션에서 targetDb 를 가리키는 관계 칸 key 들(사용자 칸 data.fields + 꾸러미 baseFields) */
export function castKeys(look: RelationLook, targetDb: string, sourceId: string): string[] {
    const owner = ownerOf(look, sourceId);
    if (!owner || owner === targetDb) return [];
    return fieldsOf(look, owner).filter((f) => pointsAt(f, targetDb)).map((f) => f.key);
}

/** 그 레코드가 그 칸들로 가리키는 targetDb 의 살아 있는 줄 id(순서 유지 · 겹침 없음) */
export function castTargets(look: RelationLook, targetDb: string, sourceId: string): string[] {
    const vals = valuesOf(look, sourceId);
    const out = new Set<string>();
    for (const k of castKeys(look, targetDb, sourceId)) {
        for (const e of normalizeRelation(vals[k])) if (liveIn(look, targetDb, e)) out.add(e);
    }
    return [...out];
}

/** targetDb 를 가리키는 칸에 sourceId 줄을 넣을 수 있나 — 대상 자신의 줄은 direct */
export function castCandidate(look: RelationLook, targetDb: string, sourceId: string): CastKind {
    if (liveIn(look, targetDb, sourceId)) return 'direct';
    if (!look.get(sourceId) || look.isTrashed(sourceId) || castKeys(look, targetDb, sourceId).length === 0) return 'block';
    const n = castTargets(look, targetDb, sourceId).length;
    return n === 0 ? 'empty' : n === 1 ? 'direct' : 'pick';
}

/** 다른 목록에서 넣을 수 있는 줄들 — targetDb 를 가리키는 관계 칸이 있는 컬렉션의 살아 있는 줄(block 은 안 나온다) */
export function castCandidates(look: RelationLook, targetDb: string): { id: string; name: string; from: string; kind: Exclude<CastKind, 'block'>; targets: string[] }[] {
    const colls = look.find((n) => n.id !== targetDb && !look.isTrashed(n.id) && fieldsOf(look, n.id).some((f) => pointsAt(f, targetDb)));
    return colls.flatMap((c) => recordsOf(look, c.id).map((r) => {
        const kind = castCandidate(look, targetDb, r.id);
        return kind === 'block' ? null : { id: r.id, name: r.name, from: c.name, kind, targets: castTargets(look, targetDb, r.id) };
    }).filter((x): x is NonNullable<typeof x> => x !== null));
}

/**
 * 관계 값 → 대상 줄 id[] — 쓰는 쪽(달력 예약·롤업)이 읽는 단 한 길.
 *   옛 값(대상 줄 id)은 그대로 · 캐스팅 줄은 고른 줄(그 줄이 아직 가리킬 때만) 또는 그 줄이 가리키는 대상(유일하면 하나 · 안 골랐으면 전부).
 *   못 푸는 것(없음·휴지통·관계 끊김)은 뺀다.
 */
export function resolveRelationTargets(look: RelationLook, targetDb: string, value: unknown): string[] {
    const out = new Set<string>();
    for (const e of normalizeRelation(value)) {
        const { id, via } = parseRelationEntry(e);
        if (!via && liveIn(look, targetDb, id)) { out.add(id); continue; }
        const ts = castTargets(look, targetDb, id);
        if (via) { if (ts.includes(via)) out.add(via); } else ts.forEach((t) => out.add(t));
    }
    return [...out];
}

/** 거꾸로 보기 — targetId 줄을 (캐스팅 경유 포함) 가리키는 레코드와 칸 key. 여럿 그대로 */
export function relationReferrers(look: RelationLook, targetId: string): { id: string; key: string }[] {
    const db = ownerOf(look, targetId);
    if (!db || !liveIn(look, db, targetId)) return [];
    const colls = look.find((n) => !look.isTrashed(n.id) && fieldsOf(look, n.id).some((f) => pointsAt(f, db)));
    return colls.flatMap((c) => {
        const keys = fieldsOf(look, c.id).filter((f) => pointsAt(f, db)).map((f) => f.key);
        return recordsOf(look, c.id).flatMap((r) => keys
            .filter((k) => resolveRelationTargets(look, db, valuesOf(look, r.id)[k]).includes(targetId))
            .map((key) => ({ id: r.id, key })));
    });
}
