// Deno 진입점(얇은 자리) — 판정은 handler.ts. 이 파일은 Node 시험에서 import 하지 않는다.
// config.toml 에 [functions.admin-ops] verify_jwt 줄은 두지 않는다(기본 true — 관리자 확인은 handler 가 한다).

import type { AuthClient } from '../_shared/auth.ts';
import { loadAllowedOrigin } from '../_shared/cors.ts';
import { loadKeyText } from '../_shared/crypto/keys.ts';
import { adminHandler } from './handler.ts';
import { CALL_BUDGET_MS } from './rewrap.ts';
import { supabaseAdminStore, type AdminDb } from './store.ts';

interface DenoLike {
    env: { get(name: string): string | undefined };
    serve(h: (req: Request) => Promise<Response>): unknown;
}
type Client = AuthClient & AdminDb;

const SUPABASE_JS = 'npm:@supabase/supabase-js@2';
const deno = (globalThis as unknown as { Deno: DenoLike }).Deno;
const url = deno.env.get('SUPABASE_URL');
const key = deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 없음');

const mod = (await import(SUPABASE_JS)) as { createClient(u: string, k: string, o: object): Client };
const client = mod.createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** 무작위 16 글자(hex) — ETag 앞자리 꼴 */
const newEpoch = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');

deno.serve(adminHandler({
    auth: client,
    store: supabaseAdminStore(client),
    keyText: loadKeyText,
    newEpoch,
    budget: { now: () => Date.now(), budgetMs: CALL_BUDGET_MS },
    allowedOrigin: loadAllowedOrigin(),
}));
