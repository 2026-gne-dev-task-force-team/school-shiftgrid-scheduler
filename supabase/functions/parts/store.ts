// ④ 1절 조각 저장소 — 조건부 UPDATE(판 번호가 맞을 때만) · 첫 쓰기 INSERT ON CONFLICT DO NOTHING · 보관 `doc@<n>`.
// 판정 코드는 PartsStore 꼴만 안다. supabase-js(service_role) 에 얹는 어댑터는 supabaseStore — 클라이언트는 주입받는다.
// 조각 평문 = gzip(JSON `{fmt, body}`)(④ 2절) → 봉투(_shared/crypto). AAD 에 조각 이름·판 번호가 들어간다.

import { aadPart } from '../_shared/crypto/aad.ts';
import type { DbAudit } from '../_shared/audit.ts';
import { open, seal, type Bytes, type KeyRing } from '../_shared/crypto/envelope.ts';

export interface PartRow {
    part: string;
    version: number;
    sizePlain: number;
    ct: Bytes;
}

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

// ── 평문 ↔ 봉투 ─────────────────────────────────────────────

export interface PartPlain {
    fmt: number;
    body: unknown;
}

async function pipe(data: Bytes, stream: CompressionStream | DecompressionStream): Promise<Bytes> {
    const out = new Response(new Blob([data]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** `{fmt, body}` → gzip → 봉투 */
export async function sealPart(ring: KeyRing, projectId: string, part: string, version: number, plain: PartPlain): Promise<Bytes> {
    const gz = await pipe(new Uint8Array(enc.encode(JSON.stringify(plain))), new CompressionStream('gzip'));
    return seal(ring, gz, (kid) => aadPart(projectId, part, version, kid));
}

/** 봉투 → gunzip → `{fmt, body}`. 키·AAD 가 안 맞으면 EnvelopeError(부르는 쪽이 500 decrypt_failed). */
export async function openPart(ring: KeyRing, projectId: string, part: string, version: number, ct: Bytes): Promise<PartPlain> {
    const gz = await open(ring, ct, (kid) => aadPart(projectId, part, version, kid));
    return JSON.parse(dec.decode(await pipe(gz, new DecompressionStream('gzip')))) as PartPlain;
}

// ── supabase-js 어댑터 ──────────────────────────────────────

/** PostgREST bytea: 쓸 때 `\x<hex>`, 읽을 때도 `\x<hex>` 글자로 온다. */
export function byteaToHex(b: Bytes): string {
    let s = '\\x';
    for (const x of b) s += x.toString(16).padStart(2, '0');
    return s;
}

export function hexToBytea(s: string): Bytes {
    if (!s.startsWith('\\x') || s.length % 2 !== 0) throw new Error('bytea 꼴이 아닙니다');
    const out = new Uint8Array((s.length - 2) / 2);
    for (let i = 0; i < out.length; i++) {
        const v = Number.parseInt(s.slice(2 + i * 2, 4 + i * 2), 16);
        if (Number.isNaN(v)) throw new Error('bytea 꼴이 아닙니다');
        out[i] = v;
    }
    return out;
}

type Res<T> = PromiseLike<{ data: T | null; error: unknown }>;
interface DbRow {
    part: string;
    version: number;
    size_plain: number;
    ct: string;
}

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

const toRow = (r: DbRow): PartRow => ({ part: r.part, version: r.version, sizePlain: r.size_plain, ct: hexToBytea(r.ct) });
const COLS = 'part, version, size_plain, ct';

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
            const rows = must<DbRow[]>(
                await (db.from('parts').select(COLS).eq('project_id', pid).not('part', 'like', 'doc@%') as Res<DbRow[]>),
                'parts 읽기',
            );
            return (rows ?? []).map(toRow);
        },
        async get(pid, part) {
            const r = must<DbRow>(
                await (db.from('parts').select(COLS).eq('project_id', pid).eq('part', part).maybeSingle() as Res<DbRow>),
                'parts 읽기',
            );
            return r ? toRow(r) : null;
        },
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
