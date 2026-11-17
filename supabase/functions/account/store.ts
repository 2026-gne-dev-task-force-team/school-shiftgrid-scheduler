// AccountStore 를 supabase-js(service_role) 로 채운다. bytea 는 PostgREST 에서 `\x<hex>` 글자로 오간다.
// 쓰는 부분만 꼴로 적는다(Q) — 시험은 가짜 Q 로 조건부 UPDATE 꼴을 잰다.

import type { Role } from '../../../shared/roles.ts';
import type { Bytes } from '../_shared/crypto/envelope.ts';
import type { AccountStore, InviteRow, MembershipRow } from './handler.ts';

export interface DbResult {
    data: unknown;
    error: { code?: string; message?: string } | null;
}

/** supabase-js 질의 빌더의 쓰는 부분 — 그 자체가 await 된다 */
export interface Q extends PromiseLike<DbResult> {
    select(cols: string): Q;
    insert(row: Record<string, unknown>): Q;
    update(row: Record<string, unknown>): Q;
    delete(): Q;
    eq(col: string, v: unknown): Q;
    is(col: string, v: null): Q;
    gt(col: string, v: string): Q;
    in(col: string, vs: readonly unknown[]): Q;
    limit(n: number): Q;
    maybeSingle(): PromiseLike<DbResult>;
}

export interface DbClient {
    from(table: string): Q;
}

export function toHex(b: Bytes): string {
    return '\\x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function fromHex(s: unknown): Bytes {
    if (typeof s !== 'string' || !/^\\x([0-9a-f]{2})*$/i.test(s)) throw new Error('bytea 꼴이 아닙니다');
    const h = s.slice(2);
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return out;
}

function must(r: DbResult, what: string): unknown {
    if (r.error) throw new Error(`${what} 실패`);
    return r.data;
}

export function supabaseStore(db: DbClient): AccountStore {
    return {
        async findInviteByHash(codeHash) {
            const d = must(
                await db
                    .from('invites')
                    .select('id, project_id, roles, person_ref, expires_at, used_at, revoked_at')
                    .eq('code_hash', toHex(codeHash))
                    .maybeSingle(),
                'invites 읽기',
            ) as Record<string, unknown> | null;
            if (!d) return null;
            const row: InviteRow = {
                id: String(d.id),
                projectId: String(d.project_id),
                roles: (d.roles as string[] | null) ?? [],
                personRef: (d.person_ref as string | null) ?? null,
                expiresAt: String(d.expires_at),
                usedAt: (d.used_at as string | null) ?? null,
                revokedAt: (d.revoked_at as string | null) ?? null,
            };
            return row;
        },
        async claimInvite(id, nowIso) {
            const d = must(
                await db
                    .from('invites')
                    .update({ used_at: nowIso })
                    .eq('id', id)
                    .is('used_at', null)
                    .is('revoked_at', null)
                    .gt('expires_at', nowIso)
                    .select('id'),
                'invites 집기',
            );
            return Array.isArray(d) && d.length === 1;
        },
        async releaseInvite(id) {
            must(await db.from('invites').update({ used_at: null, used_by: null }).eq('id', id), 'invites 되돌림');
        },
        async setInviteUser(id, userId) {
            must(await db.from('invites').update({ used_by: userId }).eq('id', id), 'invites used_by');
        },
        async memberExists(projectId, userId) {
            const d = must(
                await db.from('project_members').select('user_id').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
                'project_members 읽기',
            );
            return d !== null && d !== undefined;
        },
        async insertMember(row: { projectId: string; userId: string; roles: Role[]; personRef: string | null }) {
            const r = await db.from('project_members').insert({
                project_id: row.projectId,
                user_id: row.userId,
                roles: row.roles,
                person_ref: row.personRef,
            });
            if (r.error?.code === '23505' && row.personRef !== null && /person_ref/.test(r.error.message ?? '')) return 'person_taken';
            must(r, 'project_members 넣기');
            return 'ok';
        },
        async insertProject(row) {
            must(
                await db.from('projects').insert({
                    id: row.id,
                    name_ct: toHex(row.nameCt),
                    data_epoch: row.dataEpoch,
                    created_by: row.createdBy,
                }),
                'projects 넣기',
            );
        },
        async deleteProject(id) {
            must(await db.from('projects').delete().eq('id', id), 'projects 지우기');
        },
        async listMemberships(userId) {
            const d = must(
                await db.from('project_members').select('project_id, roles, person_ref, active').eq('user_id', userId),
                'project_members 읽기',
            ) as Record<string, unknown>[] | null;
            return (d ?? []).map(
                (m): MembershipRow => ({
                    projectId: String(m.project_id),
                    roles: (m.roles as string[] | null) ?? null,
                    personRef: (m.person_ref as string | null) ?? null,
                    active: m.active === true,
                }),
            );
        },
        async projectNames(ids) {
            const d = must(await db.from('projects').select('id, name_ct').in('id', ids), 'projects 읽기') as
                | Record<string, unknown>[]
                | null;
            return (d ?? []).map((p) => ({ id: String(p.id), nameCt: fromHex(p.name_ct) }));
        },
    };
}
