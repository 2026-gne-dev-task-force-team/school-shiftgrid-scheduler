// ③ 3-5 서버 쪽 확인: 머리의 JWT → auth.getUser() → project_members(service_role) → 구성원·역할·active.
// 아니면 401 `unauthorized`(토큰 없음·무효) / 403 `not_member`(비구성원·정지 — 둘을 밖에 가르지 않는다).
// JWT 커스텀 클레임은 안 쓴다 — 정지가 요청마다 바로 먹게 매번 표를 읽는다(② 2-3).
// supabase-js 클라이언트는 주입받는다(아래 AuthClient 는 그 일부 꼴) — 시험은 가짜를 넘긴다.

import { ROLES, type Role } from '../../../shared/roles.ts';
import { errors } from './errors.ts';

/** supabase-js `SupabaseClient`(service_role) 에서 쓰는 부분만 */
export interface AuthClient {
    auth: {
        getUser(jwt: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
    };
    from(table: 'project_members'): {
        select(cols: string): {
            eq(col: string, v: string): {
                eq(col: string, v: string): {
                    maybeSingle(): PromiseLike<{ data: { roles: string[] | null; active: boolean } | null; error: unknown }>;
                };
            };
        };
    };
}

export interface Member {
    userId: string;
    projectId: string;
    roles: Role[];
}

/** `Authorization: Bearer <jwt>` 에서 토큰. 꼴이 아니면 null. */
export function bearerToken(header: string | null | undefined): string | null {
    if (!header) return null;
    const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
    return m ? m[1] : null;
}

/** 로그인한 사용자 id — 토큰이 없거나 Auth 가 거부하면 401. */
export async function requireUser(client: AuthClient, authHeader: string | null | undefined): Promise<string> {
    const jwt = bearerToken(authHeader);
    if (!jwt) throw errors.unauthorized();
    let res: Awaited<ReturnType<AuthClient['auth']['getUser']>>;
    try {
        res = await client.auth.getUser(jwt);
    } catch {
        throw errors.unauthorized();
    }
    const id = res.data?.user?.id;
    if (res.error || !id) throw errors.unauthorized();
    return id;
}

/** 구성원 행 판정(순수) — 행 없음·정지·역할 없음이면 403 `not_member`. 모르는 역할 낱말은 버린다. */
export function judgeMember(
    row: { roles: string[] | null; active: boolean } | null,
    userId: string,
    projectId: string,
): Member {
    if (!row || row.active !== true) throw errors.notMember();
    const roles = (row.roles ?? []).filter((r): r is Role => (ROLES as readonly string[]).includes(r));
    if (roles.length === 0) throw errors.notMember();
    return { userId, projectId, roles };
}

/** 그 프로젝트의 살아 있는 구성원인가 — 표 읽기 실패는 500(던진 채 둔다), 아니면 403. */
export async function requireMember(client: AuthClient, userId: string, projectId: string): Promise<Member> {
    if (!projectId) throw errors.notMember();
    const { data, error } = await client
        .from('project_members')
        .select('roles, active')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw new Error('project_members 읽기 실패');
    return judgeMember(data, userId, projectId);
}

/** 401 → 403 순서로 한 번에 */
export async function requireProjectMember(
    client: AuthClient,
    authHeader: string | null | undefined,
    projectId: string,
): Promise<Member> {
    const userId = await requireUser(client, authHeader);
    return requireMember(client, userId, projectId);
}
