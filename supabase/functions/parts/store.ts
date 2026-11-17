// ④ 1절 조각 저장소 — 조건부 UPDATE(판 번호가 맞을 때만) · 첫 쓰기 INSERT ON CONFLICT DO NOTHING · 보관 `doc@<n>`.
// 판정 코드는 PartsStore 꼴만 안다. supabase-js(service_role) 에 얹는 어댑터는 supabaseStore — 클라이언트는 주입받는다.
// 조각 평문 = gzip(JSON `{fmt, body}`)(④ 2절) → 봉투(_shared/crypto). AAD 에 조각 이름·판 번호가 들어간다.

import type { DbAudit } from '../_shared/audit.ts';
import type { Bytes } from '../_shared/crypto/envelope.ts';
import { byteaToHex, PART_COLS, readPartRow, toPartRow, type PartDbRow, type PartRow } from '../_shared/doc.ts';

export interface PartsStore {
    /** projects.data_epoch — 프로젝트가 없으면 null */
    epoch(projectId: string): Promise<string | null>;
    /** 보관 `doc@<n>` 을 뺀 조각 전부 */
    list(projectId: string): Promise<PartRow[]>;
    get(projectId: string, part: string): Promise<PartRow | null>;
    /** 첫 쓰기 — version 1 로 넣는다. 이미 있으면(경쟁) 거짓 → 412 */
    insertFirst(projectId: string, row: Omit<PartRow, 'version'>): Promise<boolean>;
    /** `WHERE version = from` 일 때만 version = from+1. 0행이면 거짓 → 412 */
    update(projectId: string, part: string, from: number, row: Omit<PartRow, 'part' | 'version'>): Promise<boolean>;
    /** 보관 조각 넣기 — 같은 이름이 있으면 그대로 둔다(같은 판의 같은 내용이다) */
    putArchive(projectId: string, row: PartRow): Promise<void>;
    /**
     * 한 트랜잭션 쓰기(마이그레이션 0002 `parts_put`) — epoch·판 번호 비교 → 보관 → 덮기(첫 쓰기면 넣기) → 감사.
     * 판이 틀리면(그 사이 다른 쪽이 고침) 거짓 → 412. 이 구멍이 있으면 handler 는 putArchive·update·insertFirst 를 따로 부르지 않는다.
     */
    putAtomic?(projectId: string, w: AtomicPut): Promise<boolean>;
}

export interface AtomicPut {
    part: string;
    /** If-Match 의 epoch · version(없던 조각이면 0) */
    epoch: string;
    from: number;
    sizePlain: number;
    ct: Bytes;
    /** 옛 판 보관 — part 는 `<part>@<from>`, version 은 from */
    archive?: PartRow | null;
    /** 같은 트랜잭션에 넣을 감사 줄 */
    audit?: DbAudit | DbAudit[] | null;
}

// 평문 ↔ 봉투 · bytea · 조각 한 줄 읽기는 _shared/doc.ts(sub 함수와 같이 쓴다) — 여기선 다시 내보낸다.
export { byteaToHex, hexToBytea, openPart, sealPart, type PartPlain, type PartRow } from '../_shared/doc.ts';

type Res<T> = PromiseLike<{ data: T | null; error: unknown }>;

/** supabase-js 에서 쓰는 사슬만 — 넓게 잡는다(체인 꼴은 어댑터 안에서만 쓴다) */
export interface PartsDb {
    // oxlint-disable-next-line typescript/no-explicit-any
    from(table: 'parts' | 'projects'): any;
    /** PostgREST RPC — 있으면 putAtomic 을 채운다 */
    rpc?(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

/** 감사 줄 → RPC 인자 jsonb 꼴(body_ct 는 PostgREST bytea 글자) */
export const auditJson = (a: DbAudit | DbAudit[] | null | undefined): unknown =>
    a == null ? null : Array.isArray(a) ? a.map((x) => ({ ...x, body_ct: byteaToHex(x.body_ct) })) : { ...a, body_ct: byteaToHex(a.body_ct) };


function must<T>(res: { data: T | null; error: unknown }, what: string): T | null {
    if (res.error) throw new Error(`${what} 실패`);
    return res.data;
}

export function supabaseStore(db: PartsDb): PartsStore {
    const rpc = db.rpc?.bind(db);
    const putAtomic = rpc && (async (pid: string, w: AtomicPut): Promise<boolean> => {
        const r = await rpc('parts_put', {
            p_project_id: pid, p_part: w.part, p_epoch: w.epoch, p_from: w.from,
            p_size_plain: w.sizePlain, p_ct: byteaToHex(w.ct),
            p_archive_part: w.archive?.part ?? null, p_archive_size: w.archive?.sizePlain ?? null,
            p_archive_ct: w.archive ? byteaToHex(w.archive.ct) : null,
            p_audit: auditJson(w.audit),
        });
        if (r.error?.code === 'PT412') return false;
        if (r.error) throw new Error('parts_put 실패');
        return true;
    });
    return {
        ...(putAtomic ? { putAtomic } : {}),
        async epoch(pid) {
            const r = must<{ data_epoch: string }>(
                await (db.from('projects').select('data_epoch').eq('id', pid).maybeSingle() as Res<{ data_epoch: string }>),
                'projects 읽기',
            );
            return r?.data_epoch ?? null;
        },
        async list(pid) {
            const rows = must<PartDbRow[]>(
                await (db.from('parts').select(PART_COLS).eq('project_id', pid).not('part', 'like', 'doc@%') as Res<PartDbRow[]>),
                'parts 읽기',
            );
            return (rows ?? []).map(toPartRow);
        },
        get: (pid, part) => readPartRow(db, pid, part),
        async insertFirst(pid, row) {
            const rows = must<{ part: string }[]>(
                await (db.from('parts')
                    .upsert(
                        { project_id: pid, part: row.part, version: 1, size_plain: row.sizePlain, ct: byteaToHex(row.ct) },
                        { onConflict: 'project_id,part', ignoreDuplicates: true },
                    )
                    .select('part') as Res<{ part: string }[]>),
                'parts 첫 쓰기',
            );
            return (rows ?? []).length === 1;
        },
        async update(pid, part, from, row) {
            const rows = must<{ version: number }[]>(
                await (db.from('parts')
                    .update({ version: from + 1, size_plain: row.sizePlain, ct: byteaToHex(row.ct), updated_at: new Date().toISOString() })
                    .eq('project_id', pid).eq('part', part).eq('version', from)
                    .select('version') as Res<{ version: number }[]>),
                'parts 조건부 쓰기',
            );
            return (rows ?? []).length === 1;
        },
        async putArchive(pid, row) {
            must(
                await (db.from('parts').upsert(
                    { project_id: pid, part: row.part, version: row.version, size_plain: row.sizePlain, ct: byteaToHex(row.ct) },
                    { onConflict: 'project_id,part', ignoreDuplicates: true },
                ) as Res<unknown>),
                'parts 보관',
            );
        },
    };
}
