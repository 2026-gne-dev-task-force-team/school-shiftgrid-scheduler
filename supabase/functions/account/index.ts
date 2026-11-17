// Deno 진입점(얇은 자리) — 판정은 handler.ts · DB 는 store.ts. 이 파일은 Node 시험에서 import 하지 않는다.
// supabase-js 는 Deno 의 `npm:` 지정자로 실행 때 불러온다(Node tsc 가 해석하지 않게 문자열 변수로).
// service_role 키로 만든 클라이언트 하나가 JWT 확인(auth.getUser)·계정 생성(auth.admin.createUser)·표 쓰기를 다 한다.

import { loadAllowedOrigin } from '../_shared/cors.ts';
import { aadProject } from '../_shared/crypto/aad.ts';
import { ensureKeys } from '../_shared/crypto/keys.ts';
import { accountHandler, type AccountAuth } from './handler.ts';
import { fromHex, supabaseStore, type DbClient } from './store.ts';

interface DenoLike {
    env: { get(name: string): string | undefined };
    serve(h: (req: Request) => Promise<Response>): unknown;
}

type Client = AccountAuth & DbClient;

const SUPABASE_JS = 'npm:@supabase/supabase-js@2';
const deno = (globalThis as unknown as { Deno: DenoLike }).Deno;
const url = deno.env.get('SUPABASE_URL');
const key = deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 없습니다');

const mod = (await import(SUPABASE_JS)) as { createClient(u: string, k: string, o: object): Client };
const client = mod.createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** 콜드 스타트 키 검사 — meta.kids_in_use 와 프로젝트 이름 하나를 견본으로(④ 6-1) */
async function keys() {
    return ensureKeys(async () => {
        const meta = await client.from('meta').select('kids_in_use').maybeSingle();
        const kidsInUse = ((meta.data as { kids_in_use?: string[] } | null)?.kids_in_use ?? []) as string[];
        const p = await client.from('projects').select('id, name_ct').limit(1).maybeSingle();
        const row = p.data as { id: string; name_ct: string } | null;
        const sample = row ? { envelope: fromHex(row.name_ct), aadFor: (kid: string) => aadProject(row.id, kid) } : null;
        return { kidsInUse, sample };
    });
}

deno.serve(accountHandler({ client, store: supabaseStore(client), keys, allowedOrigin: loadAllowedOrigin() }));
