// ② 9절 B3 끝 조건 — config.toml 의 `verify_jwt = false` 는 health·account 둘에만 걸린다.
// (로그인 전 health·signup 이 게이트웨이 401 에 막히지 않게 · 나머지 함수는 게이트웨이가 JWT 를 먼저 거른다)
// supabase CLI 가 없는 기기에서도 돌게 config.toml 을 글로 읽어 [functions.<이름>] 칸만 잰다.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NO_JWT = ['account', 'health'];

/** `[functions.<이름>]` 칸마다 verify_jwt 값(안 적혔으면 undefined = 기본 true) */
function verifyJwtTable(toml: string): Record<string, boolean | undefined> {
    const out: Record<string, boolean | undefined> = {};
    let cur: string | null = null;
    for (const raw of toml.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line) continue;
        const sec = /^\[([^\]]+)\]$/.exec(line);
        if (sec) {
            const m = /^functions\.([A-Za-z0-9_-]+)$/.exec(sec[1].trim());
            cur = m ? m[1] : null;
            if (cur && !(cur in out)) out[cur] = undefined;
            continue;
        }
        const kv = /^verify_jwt\s*=\s*(true|false)$/.exec(line);
        if (cur && kv) out[cur] = kv[1] === 'true';
    }
    return out;
}

describe('config.toml verify_jwt (② B3)', () => {
    const toml = readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8');
    const table = verifyJwtTable(toml);
    const fns = readdirSync(resolve(ROOT, 'supabase/functions'), { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
        .map((e) => e.name);

    it('health·account 는 verify_jwt = false', () => {
        for (const f of NO_JWT) expect(table[f], f).toBe(false);
    });
    it('그 밖 함수는 false 가 아니다(게이트웨이 JWT 검사 유지)', () => {
        const opened = fns.filter((f) => !NO_JWT.includes(f) && table[f] === false);
        expect(opened).toEqual([]);
    });
    it('config.toml 의 [functions.*] 칸은 실제 함수 폴더를 가리킨다', () => {
        expect(Object.keys(table).filter((f) => !fns.includes(f))).toEqual([]);
    });
    it('읽개 자체 — 주석·다른 칸의 verify_jwt 는 세지 않는다', () => {
        const t = verifyJwtTable('[functions.a]\n# verify_jwt = false\n[x]\nverify_jwt = false\n[functions.b]\nverify_jwt = false # 무인증\n');
        expect(t).toEqual({ a: undefined, b: false });
    });
});
