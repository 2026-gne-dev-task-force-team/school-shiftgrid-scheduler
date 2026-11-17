// 판 T-10dw 검사 — 마이그레이션 0002: last_admin 트리거 · parts_put · sub_register · 감사 같이 쓰기
// B1 과 같은 바닥(PGlite + supabase-shim.sql). 저장 어댑터(parts/store.ts · sub/rows.ts)를 PGlite 위 가짜 rpc 에 꽂아 함께 잰다.
// ⚠️ PGlite 는 연결 하나뿐이라 「동시」 강등은 순차 두 번(먼저 커밋 → 뒤가 막힘)으로 대신 잰다 — 잠금 대기 자체는 못 잰다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbAudit } from '../functions/_shared/audit.ts';
import { supabaseStore } from '../functions/parts/store.ts';
import { rpcRegister, type DbSlot, type RpcDb } from '../functions/sub/rows.ts';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const A1 = '00000000-0000-4000-8000-0000000000a1';
const A2 = '00000000-0000-4000-8000-0000000000a2';
const T1 = '00000000-0000-4000-8000-0000000000b1';

let pg: PGlite;

type Out = { rows: Record<string, unknown>[]; code?: undefined } | { rows?: undefined; code: string };

/** 한 역할로 문장 하나 — commit 이면 남기고, 아니면 되돌린다. 실패면 SQLSTATE. */
async function run(role: 'anon' | 'authenticated' | 'service_role', sql: string, commit = false): Promise<Out> {
    await pg.exec('begin');
    try {
        await pg.exec(`set local role ${role}`);
        const r = await pg.query<Record<string, unknown>>(sql);
        await pg.exec(commit ? 'commit' : 'rollback');
        return { rows: r.rows };
    } catch (e) {
        await pg.exec('rollback');
        return { code: String((e as { code?: string }).code ?? e) };
    }
}

/** supabase-js `rpc` 흉내 — service_role 로 함수를 이름 인자로 부르고, 한 요청 = 한 트랜잭션(PostgREST 와 같게) */
const db: RpcDb & { from(): never } = {
    from() {
        throw new Error('이 시험은 rpc 만 쓴다');
    },
    async rpc(fn, args) {
        const keys = Object.keys(args);
        const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
        // PostgREST 는 bytea 인자 `\x<hex>` 글자를 bytea 입력으로 읽는다 — PGlite 매개변수는 바이트를 받아야 해서 여기서 푼다
        const params = keys.map((k) => {
            const v = args[k];
            if (typeof v === 'string' && /^\\x([0-9a-f]{2})*$/i.test(v)) return Uint8Array.from(v.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16));
            return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
        });
        await pg.exec('begin');
        try {
            await pg.exec('set local role service_role');
            const r = await pg.query<{ r: unknown }>(sql, params);
            await pg.exec('commit');
            return { data: r.rows[0]?.r ?? null, error: null };
        } catch (e) {
            await pg.exec('rollback');
            const x = e as { code?: string; message?: string };
            return { data: null, error: { code: x.code, message: x.message } };
        }
    },
};

const one = async <T>(sql: string): Promise<T[]> => (await pg.query<T>(sql)).rows;
const bytes = (...b: number[]) => new Uint8Array(b);
const auditRow = (id: string, pid = 'p1'): DbAudit => ({
    id, project_id: pid, at: '2026-11-17T10:00:00.000Z', module: 'parts', action: 'put', target: 'doc', body_ct: bytes(0xaa, 0xbb),
});

beforeAll(async () => {
    pg = await PGlite.create({ extensions: { pgcrypto } });
    await pg.exec(read('./supabase-shim.sql'));
    await pg.exec(read('../migrations/0001_tt_ops.sql'));
    await pg.exec(read('../migrations/0002_tt_ops_rpc.sql'));
    await pg.exec(`
        insert into auth.users (id) values ('${A1}'), ('${A2}'), ('${T1}');
        insert into public.projects (id, name_ct, data_epoch, created_by) values
            ('p1', '\\x01', 'e1', '${A1}'), ('p2', '\\x01', 'e2', '${A1}'), ('p3', '\\x01', 'e3', '${A1}');
        insert into public.project_members (project_id, user_id, roles, person_ref) values
            ('p2', '${A1}', array['관리자'], 'a1'), ('p2', '${A2}', array['관리자','교사'], 'a2'), ('p2', '${T1}', array['교사'], 't1'),
            ('p3', '${A1}', array['관리자'], 'a1'), ('p3', '${A2}', array['관리자'], 'a2');
        insert into public.parts (project_id, part, version, size_plain, ct) values ('p1', 'doc', 3, 10, '\\x02');
        insert into public.sub_slot (id, project_id, date, track_name, start_min, end_min, status, body_ct)
            values ('s1', 'p1', '2026-11-17', '1-1', 540, 585, '대기', '\\x03');
    `);
}, 60000);

afterAll(async () => { await pg?.close(); });

const admins = async (pid: string) =>
    (await one<{ user_id: string }>(`select user_id from public.project_members where project_id = '${pid}' and active and '관리자' = any(roles) order by user_id`))
        .map((r) => r.user_id);

describe('① last_admin 트리거', () => {
    it('관리자가 둘이면 하나 강등은 된다(되돌림) · 교사 줄 고치기는 잼 대상 아님', async () => {
        expect((await run('service_role', `update public.project_members set roles = array['교사'] where project_id = 'p2' and user_id = '${A2}' returning user_id`)).rows).toHaveLength(1);
        expect((await run('service_role', `update public.project_members set active = false where project_id = 'p2' and user_id = '${T1}' returning user_id`)).rows).toHaveLength(1);
    });

    it('한 문장으로 관리자 둘을 다 정지 → PT409(AFTER 트리거라 문장 결과를 센다)', async () => {
        expect(await run('service_role', `update public.project_members set active = false where project_id = 'p2' and '관리자' = any(roles)`)).toEqual({ code: 'PT409' });
        expect(await admins('p2')).toEqual([A1, A2]);
    });

    it('동시 강등 대체(순차 두 번): 먼저 커밋한 A1→A2 강등은 되고, 뒤의 A2→A1 강등은 PT409', async () => {
        // 관리자 둘이 서로를 강등 — 실 서버에선 프로젝트 행 잠금으로 줄 서서 뒤쪽이 새 스냅숏으로 0명을 본다
        expect((await run('service_role', `update public.project_members set roles = array['교사'] where project_id = 'p3' and user_id = '${A2}' returning user_id`, true)).rows).toHaveLength(1);
        expect(await run('service_role', `update public.project_members set roles = array['교사'] where project_id = 'p3' and user_id = '${A1}'`)).toEqual({ code: 'PT409' });
        expect(await admins('p3')).toEqual([A1]);
    });

    it('마지막 관리자 정지·지우기 · 다른 프로젝트로 옮기기도 PT409', async () => {
        for (const sql of [
            `update public.project_members set active = false where project_id = 'p3' and user_id = '${A1}'`,
            `delete from public.project_members where project_id = 'p3' and user_id = '${A1}'`,
            `update public.project_members set project_id = 'p1' where project_id = 'p3' and user_id = '${A1}'`,
        ]) {
            expect(await run('service_role', sql), sql).toEqual({ code: 'PT409' });
        }
        expect(await admins('p3')).toEqual([A1]);
    });

    it('오류 문구는 last_admin(account 저장 어댑터가 이 낱말로 409 를 고른다)', async () => {
        await expect(pg.exec(`update public.project_members set active = false where project_id = 'p3' and user_id = '${A1}'`))
            .rejects.toMatchObject({ code: 'PT409', message: 'last_admin' });
    });
});

describe('② parts_put (parts/store.ts putAtomic)', () => {
    const store = supabaseStore(db);
    const doc = async () => (await one<{ part: string; version: number; size_plain: number }>(
        `select part, version, size_plain from public.parts where project_id = 'p1' order by part`));

    it('저장 어댑터가 rpc 를 보면 putAtomic 을 채운다', () => {
        expect(typeof store.putAtomic).toBe('function');
    });

    it('If-Match 판이 틀리면 거짓(PT412) · 보관도 안 남는다', async () => {
        const archive = { part: 'doc@2', version: 2, sizePlain: 10, ct: bytes(9) };
        expect(await store.putAtomic!('p1', { part: 'doc', epoch: 'e1', from: 2, sizePlain: 5, ct: bytes(7), archive })).toBe(false);
        expect(await store.putAtomic!('p1', { part: 'doc', epoch: 'e0', from: 3, sizePlain: 5, ct: bytes(7) })).toBe(false);
        expect(await doc()).toEqual([{ part: 'doc', version: 3, size_plain: 10 }]);
    });

    it('맞으면 doc@3 보관 + doc 4판 + 감사 한 줄이 한 번에', async () => {
        const ok = await store.putAtomic!('p1', {
            part: 'doc', epoch: 'e1', from: 3, sizePlain: 5, ct: bytes(7),
            archive: { part: 'doc@3', version: 3, sizePlain: 10, ct: bytes(8) }, audit: auditRow('au1'),
        });
        expect(ok).toBe(true);
        expect(await doc()).toEqual([{ part: 'doc', version: 4, size_plain: 5 }, { part: 'doc@3', version: 3, size_plain: 10 }]);
        expect(await one(`select encode(ct, 'hex') as h from public.parts where project_id = 'p1' and part = 'doc@3'`)).toEqual([{ h: '08' }]);
        expect(await one(`select id, module, action, target, encode(body_ct, 'hex') as h from public.audit_log where id = 'au1'`))
            .toEqual([{ id: 'au1', module: 'parts', action: 'put', target: 'doc', h: 'aabb' }]);
    });

    it('첫 쓰기(from 0)는 1판 · 두 번째 첫 쓰기는 거짓', async () => {
        expect(await store.putAtomic!('p1', { part: 'ops.rooms', epoch: 'e1', from: 0, sizePlain: 2, ct: bytes(1) })).toBe(true);
        expect(await store.putAtomic!('p1', { part: 'ops.rooms', epoch: 'e1', from: 0, sizePlain: 2, ct: bytes(1) })).toBe(false);
        expect(await one(`select version from public.parts where project_id = 'p1' and part = 'ops.rooms'`)).toEqual([{ version: 1 }]);
    });

    it('보관 이름이 <part>@<from> 이 아니면 던진다 · 감사가 실패하면 쓰기도 되감긴다', async () => {
        await expect(store.putAtomic!('p1', {
            part: 'doc', epoch: 'e1', from: 4, sizePlain: 5, ct: bytes(7), archive: { part: 'doc@9', version: 4, sizePlain: 5, ct: bytes(7) },
        })).rejects.toThrow('parts_put 실패');
        await expect(store.putAtomic!('p1', { part: 'doc', epoch: 'e1', from: 4, sizePlain: 6, ct: bytes(7), audit: auditRow('au1') }))
            .rejects.toThrow('parts_put 실패'); // 감사 id 중복
        expect((await doc()).find((r) => r.part === 'doc')).toEqual({ part: 'doc', version: 4, size_plain: 5 });
    });

    it('앱 역할(anon·authenticated)은 parts_put · sub_register 를 못 부른다', async () => {
        for (const role of ['anon', 'authenticated'] as const) {
            expect(await run(role, `select public.parts_put('p1', 'doc', 'e1', 4, 1, '\\x00')`), role).toEqual({ code: '42501' });
            expect(await run(role, `select public.sub_register('p1', '[]'::jsonb)`), role).toEqual({ code: '42501' });
        }
    });
});

describe('③ sub_register (sub/rows.ts rpcRegister)', () => {
    const register = rpcRegister(db);
    const slot = (id: string, start: number): DbSlot => ({
        id, project_id: 'p1', date: '2026-11-17', track_name: '1-1', start_min: start, end_min: start + 45, status: '대기',
        body_ct: bytes(0x10, start % 256), take_ct: null, created_at: '2026-11-17T09:00:00.000Z', updated_at: '2026-11-17T09:00:00.000Z',
    });
    const ids = async () => (await one<{ id: string }>(`select id from public.sub_slot where project_id = 'p1' order by start_min, id`)).map((r) => r.id);
    const s1At = async () => (await one<{ t: string }>(`select updated_at::text as t from public.sub_slot where id = 's1'`))[0]!.t;

    it('지울 행의 updated_at 이 틀리면 conflict · 아무것도 안 남는다', async () => {
        expect(await register([slot('s2', 540), slot('s3', 600)], [{ id: 's1', updatedAt: '2000-01-01T00:00:00Z' }])).toBe('conflict');
        expect(await ids()).toEqual(['s1']);
    });

    it('유일 위반(지우지 않고 같은 칸에 넣기)은 conflict', async () => {
        expect(await register([slot('s2', 540)], [])).toBe('conflict');
        expect(await ids()).toEqual(['s1']);
    });

    it('덮어쓰기 — s1 을 지우고 s2·s3 를 넣어 2행 · 감사 줄도 같이', async () => {
        const audit = { ...auditRow('au-sub'), module: 'sub', action: 'register', target: null };
        expect(await register([slot('s2', 540), slot('s3', 600)], [{ id: 's1', updatedAt: await s1At() }], audit)).toBe('ok');
        expect(await ids()).toEqual(['s2', 's3']);
        expect(await one(`select encode(body_ct, 'hex') as h, take_ct from public.sub_slot where id = 's3'`)).toEqual([{ h: '1058', take_ct: null }]);
        expect(await one(`select module, action, target from public.audit_log where id = 'au-sub'`)).toEqual([{ module: 'sub', action: 'register', target: null }]);
    });

    it('다른 프로젝트 행이 섞이면 던진다', async () => {
        await expect(register([slot('s9', 700), { ...slot('s10', 760), project_id: 'p2' }], [])).rejects.toThrow('sub_register 실패');
        expect(await ids()).toEqual(['s2', 's3']);
    });
});
