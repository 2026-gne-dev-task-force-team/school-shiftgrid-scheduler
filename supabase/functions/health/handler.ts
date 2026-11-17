// ③ 11-1 `GET /health` → `{ok:true, api:1, serverId}` — 무인증(config.toml verify_jwt=false).
// DB 를 한 번 건드려(깨우기 겸) 실패하면 503 `db_unavailable`. 순수 — DB 핑은 주입받는다.

import { errors, HttpError, jsonResponse } from '../_shared/errors.ts';
import { handle } from '../_shared/http.ts';

export const API_VERSION = 1;

export interface HealthDeps {
    /** `select 1` 몫 — 실패면 던지거나 거짓 */
    ping(): Promise<boolean>;
    serverId: string;
    allowedOrigin: string | undefined;
}

/** `https://<ref>.supabase.co` → `<ref>`. 그 밖(로컬 `http://kong:8000` 등)은 `local`. */
export function serverIdFromUrl(url: string | undefined): string {
    if (!url) return 'local';
    try {
        const host = new URL(url).hostname;
        const m = /^([a-z0-9]+)\.supabase\.(co|in)$/.exec(host);
        return m ? m[1] : 'local';
    } catch {
        return 'local';
    }
}

export function healthHandler(deps: HealthDeps): (req: Request) => Promise<Response> {
    return (req) =>
        handle(req, deps.allowedOrigin, async (r) => {
            if (r.method.toUpperCase() !== 'GET') throw errors.methodNotAllowed();
            let ok = false;
            try {
                ok = await deps.ping();
            } catch {
                ok = false;
            }
            if (!ok) throw new HttpError(503, 'db_unavailable', 'DB 에 닿지 못했습니다');
            return jsonResponse({ ok: true, api: API_VERSION, serverId: deps.serverId });
        });
}
