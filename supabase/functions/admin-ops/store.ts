// admin-ops 저장소 꼴 + supabase-js 어댑터. 판정 코드(handler·rewrap)는 AdminStore 꼴만 안다.
// 암호문 열을 가진 표 일곱 칸을 「대상(Target)」으로 하나씩 훑는다 — 표 안 기본 키 순.

import { aadAudit, aadPart, aadProject, aadRoom, aadSub, aadUser } from '../_shared/crypto/aad.ts';
import type { AadFor, Bytes } from '../_shared/crypto/envelope.ts';
import { byteaToHex, hexToBytea } from '../parts/store.ts';

/** 훑는 차례(커서의 앞자리 = 이 배열의 번호) */
export const TARGETS = [
    'parts', 'sub_slot.body', 'sub_slot.take', 'room_reservation', 'audit_log', 'projects', 'project_members',
] as const;
export type Target = (typeof TARGETS)[number];

/** 암호문 한 칸 — key 는 표 안에서 유일하고 정렬 가능한 글자(조합 키는 `/` 로 잇는다) */
export interface CtItem {
    key: string;
    ct: Bytes;
    aadFor: AadFor;
}

export interface AdminStore {
    /** key 가 after 보다 큰 것을 key 순으로 limit 개 */
    page(t: Target, after: string | null, limit: number): Promise<CtItem[]>;
    /** 암호문을 바꾼다 — 그 칸이 아직 oldCt 그대로일 때만(그 사이 쓰였으면 거짓 · 평문 판 번호는 안 건드림) */
    swap(t: Target, key: string, oldCt: Bytes, newCt: Bytes): Promise<boolean>;
    /** 견본 조각 하나(verify 검사 4) — DB 가 비었으면 null */
    sample(): Promise<{ envelope: Bytes; aadFor: AadFor } | null>;
    kidsInUse(): Promise<string[]>;
    setKidsInUse(kids: string[]): Promise<void>;
    projectIds(): Promise<string[]>;
    setEpoch(projectId: string, epoch: string): Promise<void>;
    /** 어느 프로젝트에서든 살아 있는 관리자인가 */
    isAdmin(userId: string): Promise<boolean>;
}

// ── supabase-js 어댑터 ──────────────────────────────────────

export interface AdminDb {
    // oxlint-disable-next-line typescript/no-explicit-any
    from(table: string): any;
}

type R<T> = { data: T | null; error: unknown };
function must<T>(res: R<T>, what: string): T | null {
    if (res.error) throw new Error(`${what} 실패`);
    return res.data;
}

interface Spec {
    table: string;
    col: string;
    /** 기본 키 열(정렬 순) */
    keys: string[];
    /** ct 가 null 인 행을 거를 때 */
    notNull?: boolean;
    select: string;
    aad(r: Record<string, unknown>): AadFor;
}
const s = (v: unknown) => String(v);
const SPECS: Record<Target, Spec> = {
    parts: {
        table: 'parts', col: 'ct', keys: ['project_id', 'part'], select: 'project_id, part, version, ct',
        aad: (r) => (kid) => aadPart(s(r.project_id), s(r.part), Number(r.version), kid),
    },
    'sub_slot.body': {
        table: 'sub_slot', col: 'body_ct', keys: ['id'], select: 'id, project_id, date, track_name, start_min, body_ct',
        aad: (r) => (kid) => aadSub(s(r.project_id), s(r.id), s(r.date), s(r.track_name), Number(r.start_min), kid, 'body'),
    },
    'sub_slot.take': {
        table: 'sub_slot', col: 'take_ct', keys: ['id'], notNull: true, select: 'id, project_id, date, track_name, start_min, take_ct',
        aad: (r) => (kid) => aadSub(s(r.project_id), s(r.id), s(r.date), s(r.track_name), Number(r.start_min), kid, 'take'),
    },
    room_reservation: {
        table: 'room_reservation', col: 'body_ct', keys: ['id'], select: 'id, project_id, room_id, date, start_min, slot_no, track_name, body_ct',
        aad: (r) => (kid) => aadRoom(s(r.project_id), s(r.id), s(r.room_id), s(r.date), Number(r.start_min), Number(r.slot_no), s(r.track_name), kid),
    },
    audit_log: {
        table: 'audit_log', col: 'body_ct', keys: ['id'], select: 'id, project_id, at, body_ct',
        aad: (r) => (kid) => aadAudit(s(r.project_id), s(r.id), s(r.at), kid),
    },
    projects: {
        table: 'projects', col: 'name_ct', keys: ['id'], select: 'id, name_ct',
        aad: (r) => (kid) => aadProject(s(r.id), kid),
    },
    project_members: {
        table: 'project_members', col: 'display_ct', keys: ['project_id', 'user_id'], notNull: true, select: 'project_id, user_id, display_ct',
        aad: (r) => (kid) => aadUser(s(r.user_id), kid),
    },
};

const keyOf = (sp: Spec, r: Record<string, unknown>) => sp.keys.map((k) => s(r[k])).join('/');
const splitKey = (sp: Spec, key: string) => {
    if (sp.keys.length === 1) return [key];
    const i = key.indexOf('/');
    return [key.slice(0, i), key.slice(i + 1)];
};

export function supabaseAdminStore(db: AdminDb): AdminStore {
    return {
        async page(t, after, limit) {
            const sp = SPECS[t];
            let q = db.from(sp.table).select(sp.select);
            if (sp.notNull) q = q.not(sp.col, 'is', null);
            if (after !== null) {
                if (sp.keys.length === 1) q = q.gt(sp.keys[0], after);
                else {
                    const [a, b] = splitKey(sp, after);
                    q = q.or(`${sp.keys[0]}.gt.${a},and(${sp.keys[0]}.eq.${a},${sp.keys[1]}.gt.${b})`);
                }
            }
            for (const k of sp.keys) q = q.order(k, { ascending: true });
            const rows = must<Record<string, unknown>[]>(await (q.limit(limit) as PromiseLike<R<Record<string, unknown>[]>>), `${t} 읽기`) ?? [];
            return rows.map((r) => ({ key: keyOf(sp, r), ct: hexToBytea(s(r[sp.col])), aadFor: sp.aad(r) }));
        },
        async swap(t, key, oldCt, newCt) {
            const sp = SPECS[t];
            let q = db.from(sp.table).update({ [sp.col]: byteaToHex(newCt) });
            const vals = splitKey(sp, key);
            sp.keys.forEach((k, i) => { q = q.eq(k, vals[i]); });
            const rows = must<unknown[]>(
                await (q.eq(sp.col, byteaToHex(oldCt)).select(sp.keys[0]) as PromiseLike<R<unknown[]>>), `${t} 다시 잠그기`,
            );
            return (rows ?? []).length === 1;
        },
        async sample() {
            const sp = SPECS.parts;
            const r = must<Record<string, unknown>>(
                await (db.from('parts').select(sp.select).limit(1).maybeSingle() as PromiseLike<R<Record<string, unknown>>>), 'parts 읽기',
            );
            return r ? { envelope: hexToBytea(s(r.ct)), aadFor: sp.aad(r) } : null;
        },
        async kidsInUse() {
            const m = must<{ kids_in_use: string[] }>(
                await (db.from('meta').select('kids_in_use').maybeSingle() as PromiseLike<R<{ kids_in_use: string[] }>>), 'meta 읽기',
            );
            return m?.kids_in_use ?? [];
        },
        async setKidsInUse(kids) {
            const rows = must<unknown[]>(
                await (db.from('meta').update({ kids_in_use: kids }).eq('one', true).select('one') as PromiseLike<R<unknown[]>>), 'meta 쓰기',
            );
            if ((rows ?? []).length !== 1) throw new Error('meta 행이 없습니다');
        },
        async projectIds() {
            const rows = must<{ id: string }[]>(
                await (db.from('projects').select('id').order('id', { ascending: true }) as PromiseLike<R<{ id: string }[]>>), 'projects 읽기',
            );
            return (rows ?? []).map((r) => r.id);
        },
        async setEpoch(pid, epoch) {
            must(await (db.from('projects').update({ data_epoch: epoch }).eq('id', pid) as PromiseLike<R<unknown>>), 'projects epoch 쓰기');
        },
        async isAdmin(userId) {
            const rows = must<unknown[]>(
                await (db.from('project_members').select('user_id').eq('user_id', userId).eq('active', true)
                    .contains('roles', ['관리자']).limit(1) as PromiseLike<R<unknown[]>>), 'project_members 읽기',
            );
            return (rows ?? []).length > 0;
        },
    };
}
