// 판 B1 검사 — 마이그레이션 0001 의 RLS·열 권한·제약 이름 (설계 ② 2-2 · 9절 B1 줄)
// docker·supabase CLI 없이 PGlite 위에 Supabase 흉내 바닥(supabase-shim.sql)을 깔고 마이그레이션을 얹어 잰다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const MEMBER = '00000000-0000-4000-8000-000000000001';
const OUTSIDER = '00000000-0000-4000-8000-000000000002';
const ADMIN = '00000000-0000-4000-8000-000000000003';

let pg: PGlite;

type Who = { role: 'anon' | 'authenticated' | 'service_role'; sub?: string };

/** 한 역할·JWT sub 로 문장 하나를 돌리고 되돌린다. 실패면 SQLSTATE 를 code 로 돌려준다. */
async function as(who: Who, sql: string): Promise<{ rows: Record<string, unknown>[]; code?: undefined } | { rows?: undefined; code: string }> {
    await pg.exec('begin');
    try {
        await pg.query(`select set_config('request.jwt.claim.sub', $1, true)`, [who.sub ?? '']);
        await pg.exec(`set local role ${who.role}`);
        const r = await pg.query<Record<string, unknown>>(sql);
        return { rows: r.rows };
    } catch (e) {
        return { code: String((e as { code?: string }).code ?? e) };
    } finally {
        await pg.exec('rollback');
    }
}

beforeAll(async () => {
    pg = await PGlite.create({ extensions: { pgcrypto } });
    await pg.exec(read('./supabase-shim.sql'));
    await pg.exec(read('../migrations/0001_tt_ops.sql'));
    // 씨앗(소유자 권한 — 실 서버에선 함수가 service_role 로 쓴다)
    await pg.exec(`
        insert into auth.users (id) values ('${MEMBER}'), ('${OUTSIDER}'), ('${ADMIN}');
        insert into public.projects (id, name_ct, data_epoch, created_by) values ('p1', '\\x01', 'e1', '${ADMIN}');
        insert into public.project_members (project_id, user_id, roles, person_ref) values
            ('p1', '${MEMBER}', array['교사'], 't1'),
            ('p1', '${ADMIN}', array['관리자'], 't2');
        insert into public.parts (project_id, part, version, size_plain, ct) values ('p1', 'doc', 3, 10, '\\x02');
        insert into public.sub_slot (id, project_id, date, track_name, start_min, end_min, status, body_ct)
            values ('s1', 'p1', '2026-11-17', '1-1', 540, 585, '대기', '\\x03');
        insert into public.room_reservation (id, project_id, room_id, date, start_min, end_min, slot_no, track_name, body_ct)
            values ('r1', 'p1', 'lab', '2026-11-17', 540, 585, 1, '1-1', '\\x04');
        insert into public.invites (id, project_id, code_hash, roles, expires_at, created_by)
            values ('i1', 'p1', '\\x05', array['교사'], now() + interval '1 day', '${ADMIN}');
        insert into public.audit_log (id, project_id, module, action, body_ct) values ('a1', 'p1', 'sub', 'register', '\\x06');
    `);
}, 60000);

afterAll(async () => { await pg?.close(); });

const SUB_COLS = 'id, project_id, date, track_name, start_min, end_min, status';
const member: Who = { role: 'authenticated', sub: MEMBER };
const outsider: Who = { role: 'authenticated', sub: OUTSIDER };
const admin: Who = { role: 'authenticated', sub: ADMIN };

describe('B1 설계 검사 셋', () => {
    it('① anon 으로 select ct from parts → 42501', async () => {
        expect(await as({ role: 'anon' }, 'select ct from public.parts')).toEqual({ code: '42501' });
    });

    it('② 비구성원 JWT 로 sub_slot 평문 열 읽기 → 0행', async () => {
        expect(await as(outsider, `select ${SUB_COLS} from public.sub_slot`)).toEqual({ rows: [] });
    });

    it('② 대조: 구성원 JWT 로 같은 읽기 → 1행', async () => {
        const r = await as(member, `select ${SUB_COLS} from public.sub_slot`);
        expect(r.rows).toHaveLength(1);
    });

    it('③ 구성원 JWT 로 insert → 42501', async () => {
        const r = await as(member, `insert into public.sub_slot (id, project_id, date, track_name, start_min, end_min, status, body_ct)
            values ('s2', 'p1', '2026-11-18', '1-1', 540, 585, '대기', '\\x00')`);
        expect(r).toEqual({ code: '42501' });
    });

    it('④ 제약 이름 sub_slot_uq · rr_slot_uq · rr_track_uq 존재', async () => {
        const r = await pg.query<{ conname: string }>(
            `select conname from pg_constraint where conname in ('sub_slot_uq','rr_slot_uq','rr_track_uq') order by conname`);
        expect(r.rows.map((x) => x.conname)).toEqual(['rr_slot_uq', 'rr_track_uq', 'sub_slot_uq']);
    });
});

describe('B1 덧검사 — 2-2 정책 표', () => {
    it('select * 는 암호 열 때문에 42501 (직행은 열 이름을 적어야 한다)', async () => {
        expect(await as(member, 'select * from public.sub_slot')).toEqual({ code: '42501' });
    });

    it('구성원도 암호 열은 못 읽는다(parts.ct · sub_slot.body_ct · projects.name_ct · room_reservation.body_ct)', async () => {
        for (const sql of ['select ct from public.parts', 'select body_ct from public.sub_slot',
            'select take_ct from public.sub_slot', 'select name_ct from public.projects',
            'select body_ct from public.room_reservation', 'select display_ct from public.project_members']) {
            expect(await as(member, sql), sql).toEqual({ code: '42501' });
        }
    });

    it('관리자도 invites.code_hash 는 못 읽는다', async () => {
        expect(await as(admin, 'select code_hash from public.invites')).toEqual({ code: '42501' });
    });

    it('구성원은 parts 의 (part, version) 을 읽는다', async () => {
        expect(await as(member, 'select part, version from public.parts')).toEqual({ rows: [{ part: 'doc', version: 3 }] });
    });

    it('anon 은 heartbeat 만 읽는다', async () => {
        expect((await as({ role: 'anon' }, 'select at from public.heartbeat')).rows).toHaveLength(1);
        for (const t of ['projects', 'project_members', 'invites', 'sub_slot', 'room_reservation', 'audit_log', 'meta']) {
            expect(await as({ role: 'anon' }, `select 1 from public.${t}`), t).toEqual({ code: '42501' });
        }
    });

    it('audit_log · meta 는 관리자 JWT 로도 42501', async () => {
        expect(await as(admin, 'select id from public.audit_log')).toEqual({ code: '42501' });
        expect(await as(admin, 'select one from public.meta')).toEqual({ code: '42501' });
    });

    it('앱 역할은 어떤 표에도 update · delete 못 한다', async () => {
        for (const sql of ['update public.parts set version = 9', 'delete from public.sub_slot',
            'update public.audit_log set action = \'x\'', 'delete from public.audit_log',
            'update public.heartbeat set at = now()', 'delete from public.project_members']) {
            expect(await as(admin, sql), sql).toEqual({ code: '42501' });
        }
    });

    it('project_members: 교사는 자기 줄만, 관리자는 전부', async () => {
        expect((await as(member, 'select user_id from public.project_members')).rows).toEqual([{ user_id: MEMBER }]);
        expect((await as(admin, 'select user_id from public.project_members')).rows).toHaveLength(2);
    });

    it('invites: 교사 0행 · 관리자 1행', async () => {
        expect(await as(member, 'select id from public.invites')).toEqual({ rows: [] });
        expect((await as(admin, 'select id from public.invites')).rows).toHaveLength(1);
    });

    it('비구성원은 projects · parts · room_reservation 0행', async () => {
        for (const sql of ['select id from public.projects', 'select part from public.parts', 'select id from public.room_reservation']) {
            expect(await as(outsider, sql), sql).toEqual({ rows: [] });
        }
    });

    it('anon 은 도우미 is_member 를 직접 못 부른다', async () => {
        expect(await as({ role: 'anon' }, `select public.is_member('p1')`)).toEqual({ code: '42501' });
    });

    it('service_role 은 RLS 를 지나 쓴다(함수 길)', async () => {
        const r = await as({ role: 'service_role' }, `insert into public.sub_slot (id, project_id, date, track_name, start_min, end_min, status, body_ct)
            values ('s3', 'p1', '2026-11-19', '1-1', 540, 585, '대기', '\\x00') returning id`);
        expect(r).toEqual({ rows: [{ id: 's3' }] });
    });
});
