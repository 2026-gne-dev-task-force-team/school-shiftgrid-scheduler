// Deno 진입점(얇은 자리) — 판정은 handler.ts. 이 파일은 Node 시험에서 import 하지 않는다.
// supabase-js 는 Deno 의 `npm:` 지정자로 실행 때 불러온다(Node tsc 가 해석하지 않게 문자열 변수로).

import { loadAllowedOrigin } from '../_shared/cors.ts';
import { healthHandler, serverIdFromUrl } from './handler.ts';

interface DenoLike {
    env: { get(name: string): string | undefined };
    serve(h: (req: Request) => Promise<Response>): unknown;
}
interface PingClient {
    from(t: string): { select(c: string): { limit(n: number): PromiseLike<{ error: unknown }> } };
}

const SUPABASE_JS = 'npm:@supabase/supabase-js@2';
const deno = (globalThis as unknown as { Deno: DenoLike }).Deno;
const url = deno.env.get('SUPABASE_URL');
const key = deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

let client: PingClient | undefined;
async function ping(): Promise<boolean> {
    if (!url || !key) return false;
    if (!client) {
        const mod = (await import(SUPABASE_JS)) as {
            createClient(u: string, k: string, o: object): PingClient;
        };
        client = mod.createClient(url, key, { auth: { persistSession: false } });
    }
    // select 1 몫: 가장 작은 표 한 줄(행 없음도 성공) — PostgREST 는 맨 select 1 을 못 한다
    const { error } = await client.from('projects').select('id').limit(1);
    return !error;
}

deno.serve(healthHandler({ ping, serverId: serverIdFromUrl(url), allowedOrigin: loadAllowedOrigin() }));
