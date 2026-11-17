// 감사 추가 전용 — 설계 ④ 4절. `supabase/` 의 함수·마이그레이션 코드 어디에도 audit_log 를 고치거나 지우는 길이 없음을 훑는다.
// (역할 권한 42501 은 supabase/tests/b1-rls.test.ts 가 잰다 — 여기는 함수 코드 쪽만.)
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(ts|sql)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
    }
    return out;
}

/** 주석을 줄 수를 지키며 비운다(설명 글이 걸리지 않게) */
function stripComments(src: string, kind: 'ts' | 'sql'): string {
    const blank = (m: string) => m.replace(/[^\n]/g, ' ');
    const s = src.replace(/\/\*[\s\S]*?\*\//g, blank);
    return kind === 'sql' ? s.replace(/--[^\n]*/g, blank) : s.replace(/(^|[^:])\/\/[^\n]*/g, (m, a: string) => a + blank(m.slice(a.length)));
}

/** 위반 목록 — 못 쓰는 길 */
function violations(src: string, kind: 'ts' | 'sql'): string[] {
    const s = stripComments(src, kind);
    const bad: string[] = [];
    const sql: [string, RegExp][] = [
        ['UPDATE audit_log', /\bupdate\s+(only\s+)?(public\.)?"?audit_log\b/i],
        ['DELETE FROM audit_log', /\bdelete\s+from\s+(only\s+)?(public\.)?"?audit_log\b/i],
        ['TRUNCATE audit_log', /\btruncate\b[^;]*\baudit_log\b/i],
        ['DROP audit_log', /\bdrop\s+table\b[^;]*\baudit_log\b/i],
        ['GRANT 쓰기 권한 audit_log', /\bgrant\b[^;]*\b(update|delete|truncate|all)\b[^;]*\baudit_log\b/i],
    ];
    for (const [name, re] of sql) if (re.test(s)) bad.push(name);
    // supabase-js: .from('audit_log') 뒤 같은 문장에 update·delete·upsert
    for (const m of s.matchAll(/\.from\(\s*['"`]audit_log['"`]\s*\)([^;]*)/g)) {
        const call = /\.\s*(update|delete|upsert)\s*\(/.exec(m[1]);
        if (call) bad.push(`.from('audit_log').${call[1]}()`);
    }
    return bad;
}

// audit_log 이름이 코드에 나올 수 있는 파일(supabase/ 기준) — 새 파일이 이 표 밖에서 이름을 쓰면 실패 → 검토 뒤 여기에 올린다
const MAY_NAME_AUDIT_LOG = new Set([
    'functions/_shared/audit.ts', // 봉하기·열기(쓰기는 주입 구멍 append 뿐)
    'functions/sub/index.ts', // insert 한 길
    'functions/parts/index.ts', // insert 한 길
    'functions/admin-ops/store.ts', // 키 회전 rewrap 표(body_ct 를 다시 잠글 뿐) — 예외(④ 4절 · 6-3)
    'migrations/0001_tt_ops.sql', // 표 정의·RLS·권한
    'migrations/0002_tt_ops_rpc.sql', // tt_audit_append — insert 한 길
]);

const files = walk(ROOT).map((f) => ({
    rel: relative(ROOT, f).replaceAll('\\', '/'),
    kind: f.endsWith('.sql') ? ('sql' as const) : ('ts' as const),
    src: readFileSync(f, 'utf-8'),
}));

describe('audit_log 추가 전용 — 함수·마이그레이션 코드 스캔', () => {
    it('훑을 파일이 실제로 잡힌다(빈 스캔으로 통과하지 않게)', () => {
        expect(files.length).toBeGreaterThan(10);
        expect(files.some((f) => f.rel === 'functions/_shared/audit.ts')).toBe(true);
        expect(files.some((f) => f.rel.startsWith('migrations/'))).toBe(true);
    });

    it('UPDATE·DELETE·TRUNCATE·DROP·권한 풀기·supabase-js update/delete/upsert 가 audit_log 에 한 줄도 없다', () => {
        expect(files.flatMap((f) => violations(f.src, f.kind).map((v) => `${f.rel}: ${v}`))).toEqual([]);
    });

    it('audit_log 이름을 쓰는 파일은 허용 목록뿐이다', () => {
        const names = files.filter((f) => /audit_log/.test(stripComments(f.src, f.kind))).map((f) => f.rel);
        expect(names.filter((n) => !MAY_NAME_AUDIT_LOG.has(n))).toEqual([]);
    });

    it('감사 쓰기 구멍(AuditStore)엔 append 뿐 — 고치기·지우기 함수 이름이 없다', () => {
        const src = files.find((f) => f.rel === 'functions/_shared/audit.ts')!.src;
        const body = /export interface AuditStore \{([\s\S]*?)\n\}/.exec(src)![1];
        expect([...body.matchAll(/^\s*(\w+)\(/gm)].map((m) => m[1])).toEqual(['append']);
        expect(/export (async )?function (update|delete|remove|truncate|overwrite|purge)\w*/i.test(src)).toBe(false);
    });

    it('검사기 자체 — 심은 위반은 잡고 주석·insert 는 넘긴다', () => {
        expect(violations('update public.audit_log set action = 1', 'sql')).toContain('UPDATE audit_log');
        expect(violations('DELETE FROM audit_log;', 'sql')).toContain('DELETE FROM audit_log');
        expect(violations('truncate table public.audit_log', 'sql')).toContain('TRUNCATE audit_log');
        expect(violations("await db.from('audit_log').delete().eq('id', 1);", 'ts')).toHaveLength(1);
        expect(violations("await db.from('audit_log')\n  .update({ a: 1 });", 'ts')).toHaveLength(1);
        expect(violations("await db.from('audit_log').insert([r]);", 'ts')).toEqual([]);
        expect(violations('-- update audit_log 는 안 된다\ninsert into public.audit_log values (1);', 'sql')).toEqual([]);
        expect(violations("// from('audit_log').delete()\nconst a = 1;", 'ts')).toEqual([]);
    });
});
