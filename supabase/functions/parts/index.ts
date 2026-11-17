// Deno 진입점(얇은 자리) — 판정은 handler.ts. 이 파일은 Node 시험에서 import 하지 않는다.
// supabase-js 는 Deno 의 `npm:` 지정자로 실행 때 불러온다(Node tsc 가 해석하지 않게 문자열 변수로).
// config.toml 에 [functions.parts] verify_jwt 줄은 두지 않는다(기본 true — 게이트웨이도 JWT 를 본다).

import type { AuthClient } from '../_shared/auth.ts';
import { loadAllowedOrigin } from '../_shared/cors.ts';
import { aadPart } from '../_shared/crypto/aad.ts';
import { ensureKeys } from '../_shared/crypto/keys.ts';
import { partsHandler } from './handler.ts';
import { hexToBytea, supabaseStore, type PartsDb } from './store.ts';

interface DenoLike {
    env: { get(name: string): string | undefined };
    serve(h: (req: Request) => Promise<Response>): unknown;
}
type Client = AuthClient & PartsDb & {
    // oxlint-disable-next-line typescript/no-explicit-any
    from(t: string): any;
};

const SUPABASE_JS = 'npm:@supabase/supabase-js@2';
const deno = (globalThis as unknown as { Deno: DenoLike }).Deno;
const url = deno.env.get('SUPABASE_URL');
const key = deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 없음');

const mod = (await import(SUPABASE_JS)) as { createClient(u: string, k: string, o: object): Client };
const client = mod.createClient(url, key, { auth: { persistSession: false } });

/** 콜드 스타트 키 검사 넷(④ 6-1) — meta.kids_in_use 와 조각 하나를 읽어 넘긴다 */
const keys = () =>
    ensureKeys(async () => {
        const meta = await client.from('meta').select('kids_in_use').maybeSingle();
        if (meta.error) throw new Error('meta 읽기 실패');
        const one = await client.from('parts').select('project_id, part, version, ct').limit(1).maybeSingle();
        if (one.error) throw new Error('parts 읽기 실패');
        const s = one.data as { project_id: string; part: string; version: number; ct: string } | null;
        return {
            kidsInUse: (meta.data?.kids_in_use as string[] | undefined) ?? [],
            sample: s ? { envelope: hexToBytea(s.ct), aadFor: (kid: string) => aadPart(s.project_id, s.part, s.version, kid) } : null,
        };
    });

deno.serve(partsHandler({ auth: client, store: supabaseStore(client), keys, allowedOrigin: loadAllowedOrigin() }));
