// Deno 진입점(얇은 자리) — 판정은 handler.ts. 이 파일은 Node 시험에서 import 하지 않는다(tsc 만 본다).
// supabase-js 는 Deno 의 `npm:` 지정자로 실행 때 불러온다(Node tsc 가 해석하지 않게 문자열 변수로).
// 그날 입력(loadDay·loadJudge)은 day.ts — 요청마다 새 dayLoader 를 묶어 doc 을 그 요청 안에서 한 번만 연다(_shared/doc.ts).
// register 쓰기(조건부 delete → insert)는 RPC `sub_register`(마이그레이션 0002) 한 트랜잭션 — rows.ts `rpcRegister`.

import type { AuditStore } from '../_shared/audit.ts';
import type { AuthClient } from '../_shared/auth.ts';
import { loadAllowedOrigin } from '../_shared/cors.ts';
import { aadSub, aadUser } from '../_shared/crypto/aad.ts';
import { openText, type Bytes } from '../_shared/crypto/envelope.ts';
import { ensureKeys } from '../_shared/crypto/keys.ts';
import { openDocBody, type PartsReadDb } from '../_shared/doc.ts';
import { dayLoader } from './day.ts';
import { subHandler, type SubDeps, type SubStore } from './handler.ts';
import { rpcRegister, type DbSlot, type RpcDb } from './rows.ts';

interface DenoLike {
    env: { get(name: string): string | undefined };
    serve(h: (req: Request) => Promise<Response>): unknown;
}
type Res<T> = PromiseLike<{ data: T; error: { code?: string } | null }>;
// supabase-js 쿼리 빌더에서 쓰는 부분만(느슨하게)
interface Q<T> extends Res<T> {
    select(c: string): Q<T>;
    eq(c: string, v: unknown): Q<T>;
    gte(c: string, v: unknown): Q<T>;
    lte(c: string, v: unknown): Q<T>;
    order(c: string, o?: object): Q<T>;
    limit(n: number): Q<T>;
    maybeSingle(): Res<T>;
    insert(rows: object[]): Q<T>;
    delete(): Q<T>;
    update(v: object): Q<T>;
}
interface Client extends RpcDb { from(t: string): Q<unknown>; auth: AuthClient['auth'] }

const SUPABASE_JS = 'npm:@supabase/supabase-js@2';
const deno = (globalThis as unknown as { Deno: DenoLike }).Deno;
const url = deno.env.get('SUPABASE_URL') ?? '';
const key = deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const mod = (await import(SUPABASE_JS)) as { createClient(u: string, k: string, o: object): Client };
const db = mod.createClient(url, key, { auth: { persistSession: false } });

/** PostgREST bytea `\x0a1b…` ↔ 바이트 */
const fromHex = (s: string): Bytes => {
    const h = s.startsWith('\\x') ? s.slice(2) : s;
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return out;
};
const toHex = (b: Bytes) => '\\x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

type RawSlot = Omit<DbSlot, 'body_ct' | 'take_ct'> & { body_ct: string; take_ct: string | null };
const COLS = 'id, project_id, date, track_name, start_min, end_min, status, body_ct, take_ct, created_at, updated_at';
const fromRaw = (r: RawSlot): DbSlot => ({ ...r, body_ct: fromHex(r.body_ct), take_ct: r.take_ct ? fromHex(r.take_ct) : null });

const store: SubStore = {
    async listRange(pid, from, to) {
        const { data, error } = await db.from('sub_slot').select(COLS).eq('project_id', pid).gte('date', from).lte('date', to)
            .order('date').order('start_min');
        if (error) throw new Error('sub_slot 읽기 실패');
        return (data as RawSlot[]).map(fromRaw);
    },
    // 조건부 지우기 → 넣기 → (감사) 를 RPC `sub_register` 한 트랜잭션으로(마이그레이션 0002)
    register: rpcRegister(db),
    async get(pid, id) {
        const { data, error } = await db.from('sub_slot').select(COLS).eq('project_id', pid).eq('id', id).maybeSingle();
        if (error) throw new Error('sub_slot 읽기 실패');
        return data ? fromRaw(data as RawSlot) : null;
    },
    async update(next, expect) {
        // 조건부 UPDATE — updated_at·status 가 읽은 그대로일 때만(0행 = 그 사이 바뀜 → claim_race·cancel_race)
        const { data, error } = await db.from('sub_slot')
            .update({ status: next.status, take_ct: next.take_ct ? toHex(next.take_ct) : null, updated_at: next.updated_at })
            .eq('project_id', next.project_id).eq('id', next.id).eq('updated_at', expect.updatedAt).eq('status', expect.status)
            .select('id');
        if (error) throw new Error('sub_slot 고치기 실패');
        return (data as unknown[]).length === 1 ? 'ok' : 'conflict';
    },
    async remove(pid, id, expect) {
        const { data, error } = await db.from('sub_slot').delete().eq('project_id', pid).eq('id', id).eq('updated_at', expect.updatedAt).select('id');
        if (error) throw new Error('sub_slot 지우기 실패');
        return (data as unknown[]).length === 1 ? 'ok' : 'conflict';
    },
};

const audit: AuditStore = {
    async append(r) {
        // 추가 전용 — `audit_log` 엔 insert 한 길뿐(고치기·지우기 호출을 두지 않는다)
        const { error } = await db.from('audit_log').insert([{ ...r, body_ct: toHex(r.body_ct) }]);
        if (error) throw new Error('audit_log 쓰기 실패');
    },
};

const ring = () =>
    ensureKeys(async () => {
        const meta = await db.from('meta').select('kids_in_use').maybeSingle();
        const s = await db.from('sub_slot').select(COLS).limit(1).maybeSingle();
        const one = s.data ? fromRaw(s.data as RawSlot) : null;
        return {
            kidsInUse: (meta.data as { kids_in_use: string[] } | null)?.kids_in_use ?? [],
            sample: one
                ? { envelope: one.body_ct, aadFor: (kid: string) => aadSub(one.project_id, one.id, one.date, one.track_name, one.start_min, kid, 'body') }
                : null,
        };
    });

const base: Omit<SubDeps, 'loadDay' | 'loadJudge'> = {
    auth: db as unknown as AuthClient,
    store,
    audit,
    ring,
    async memberInfo(pid, userId) {
        const { data } = await db.from('project_members').select('person_ref, display_ct').eq('project_id', pid).eq('user_id', userId).maybeSingle();
        const m = data as { person_ref: string | null; display_ct: string | null } | null;
        let name = '';
        if (m?.display_ct) {
            try {
                name = await openText(await ring(), fromHex(m.display_ct), (kid) => aadUser(userId, kid));
            } catch {
                name = '';
            }
        }
        return { personRef: m?.person_ref ?? null, name };
    },
    clock: () => new Date(),
    newId: () => crypto.randomUUID(),
    allowedOrigin: loadAllowedOrigin(),
};

// 요청마다 새 loadDay·loadJudge — doc 열기 memo 가 요청 사이로 새지 않게(키 회전·조각 갱신을 바로 본다)
deno.serve((req) => subHandler({ ...base, ...dayLoader(async (pid) => openDocBody(await ring(), db as unknown as PartsReadDb, pid)) })(req));
