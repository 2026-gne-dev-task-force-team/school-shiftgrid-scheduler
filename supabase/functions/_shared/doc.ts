// 조각(parts) 읽기·열기 공용 — parts 함수(B6)와 sub 함수(그날 입력)가 같이 쓴다.
// 조각 평문 = gzip(JSON `{fmt, body}`)(④ 2절) → 봉투(crypto/envelope). AAD 에 조각 이름·판 번호가 들어간다.
// gunzip 은 Web 표준 CompressionStream/DecompressionStream(Deno·Node 18+ 둘 다 있음).

import { aadPart } from './crypto/aad.ts';
import { EnvelopeError, open, seal, type Bytes, type KeyRing } from './crypto/envelope.ts';
import { HttpError } from './errors.ts';

export interface PartRow {
    part: string;
    version: number;
    sizePlain: number;
    ct: Bytes;
}

export interface PartPlain {
    fmt: number;
    body: unknown;
}

// ── 평문 ↔ 봉투 ─────────────────────────────────────────────

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

// ── PostgREST bytea ─────────────────────────────────────────

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

// ── 읽기 ────────────────────────────────────────────────────

/** supabase-js 에서 쓰는 사슬만 — 넓게 잡는다(체인 꼴은 이 파일·parts/store.ts 안에서만 쓴다) */
export interface PartsReadDb {
    // oxlint-disable-next-line typescript/no-explicit-any
    from(table: 'parts' | 'projects'): any;
}

export interface PartDbRow {
    part: string;
    version: number;
    size_plain: number;
    ct: string;
}

export const PART_COLS = 'part, version, size_plain, ct';
export const toPartRow = (r: PartDbRow): PartRow => ({ part: r.part, version: r.version, sizePlain: r.size_plain, ct: hexToBytea(r.ct) });

/** 조각 하나(암호문 그대로) — 없으면 null · 읽기 오류면 던진다 */
export async function readPartRow(db: PartsReadDb, projectId: string, part: string): Promise<PartRow | null> {
    const res = (await db.from('parts').select(PART_COLS).eq('project_id', projectId).eq('part', part).maybeSingle()) as {
        data: PartDbRow | null;
        error: unknown;
    };
    if (res.error) throw new Error('parts 읽기 실패');
    return res.data ? toPartRow(res.data) : null;
}

/**
 * 조각 하나를 읽어 연다 → 본문(`body`). 조각이 없으면 null.
 * 봉투·gzip·JSON 이 깨졌으면 500 `decrypt_failed`(원인은 로그에만).
 */
export async function openPartBody(ring: KeyRing, db: PartsReadDb, projectId: string, part: string): Promise<unknown | null> {
    const row = await readPartRow(db, projectId, part);
    return row ? openRowBody(ring, projectId, { ...row, part }) : null;
}

/** 읽어 온 조각 행 하나를 연다 → 본문(AAD 는 `row.part`·`row.version`). 깨졌으면 500 `decrypt_failed`(`doc`·`doc@<n>` 은 「시간표를 열지 못했습니다」). */
export async function openRowBody(ring: KeyRing, projectId: string, row: PartRow): Promise<unknown> {
    const { part } = row;
    try {
        return (await openPart(ring, projectId, part, row.version, row.ct)).body;
    } catch (e) {
        console.error(`decrypt_failed part=${part} ${e instanceof EnvelopeError ? e.code : 'gzip/json'}`);
        const isDoc = part === 'doc' || part.startsWith('doc@');
        throw new HttpError(500, 'decrypt_failed', isDoc ? '시간표를 열지 못했습니다' : '그날 자료를 열지 못했습니다');
    }
}

/** 덩어리 `doc` 조각 본문 — `openPartBody(…, 'doc')` */
export const openDocBody = (ring: KeyRing, db: PartsReadDb, projectId: string): Promise<unknown | null> => openPartBody(ring, db, projectId, 'doc');
