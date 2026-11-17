// D3 그날 판 열기 — 가짜 supabase(parts 표) + 실제 봉투. ⛔ 실제 Supabase · 지어낸 이름만.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Bytes, KeyRing } from '../_shared/crypto/envelope.ts';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import { byteaToHex, sealPart, type PartsReadDb } from '../_shared/doc.ts';
import { openDocFor, readDocRows } from './doc.ts';

const PID = 'p-가상';
const grid = (tag: string) => ({ meta: { schemaVersion: 3 }, tag, tracks: [], specs: [], agents: [], assignments: [] });

let ring: KeyRing;
beforeAll(async () => {
    const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    ring = await buildKeyRing(parseKeys(`k1:${raw}`));
});

type Row = { part: string; version: number; ct: Bytes };
const row = async (part: string, version: number, body: unknown): Promise<Row> => ({ part, version, ct: await sealPart(ring, PID, part, version, { fmt: 1, body }) });

/** 가짜 supabase — `from('parts').select().eq('project_id').or('part.eq.doc,part.like.doc@*')` 만. 받은 or 식을 남긴다. */
function fakeDb(rows: Row[]): PartsReadDb & { orExpr: string | null } {
    const db = {
        orExpr: null as string | null,
        from(table: string) {
            if (table !== 'parts') throw new Error(table);
            let pid = '';
            const q = {
                select: () => q,
                eq: (c: string, val: string) => ((c === 'project_id' ? (pid = val) : null), q),
                or: async (expr: string) => {
                    db.orExpr = expr;
                    const hit = rows.filter((r) => pid === PID && (r.part === 'doc' || r.part.startsWith('doc@')));
                    return { data: hit.map((r) => ({ part: r.part, version: r.version, size_plain: 0, ct: byteaToHex(r.ct) })), error: null };
                },
            };
            return q;
        },
    };
    return db;
}

const wrap = (tag: string, validFrom: string | null, validTo: string | null) => ({ doc: grid(tag), validFrom, validTo });

describe('openDocFor — 그날 쓸 판', () => {
    it('판이 없으면 null', async () => {
        expect(await openDocFor('sub', ring, fakeDb([]), PID, '2026-11-17')).toBeNull();
    });
    it('지금 판이 그날을 덮으면 지금 판(감싼 꼴은 벗긴다)', async () => {
        const db = fakeDb([await row('doc', 5, wrap('가을', '2026-08-24', '2027-02-28')), await row('doc@4', 4, wrap('봄', '2026-03-02', '2026-07-20'))]);
        const got = await openDocFor('sub', ring, db, PID, '2026-11-17');
        expect(got?.part).toBe('doc');
        expect(got?.doc).toMatchObject({ tag: '가을' });
        expect(db.orExpr).toBe('part.eq.doc,part.like.doc@*');
    });
    it('지난 날이면 그 기간의 보관 판', async () => {
        const db = fakeDb([await row('doc', 5, wrap('가을', '2026-08-24', '2027-02-28')), await row('doc@4', 4, wrap('봄', '2026-03-02', '2026-07-20'))]);
        expect((await openDocFor('sub', ring, db, PID, '2026-05-01'))?.part).toBe('doc@4');
    });
    it('기간이 겹치면 최신 — 보관 번호는 숫자로 비교(doc@10 > doc@9)', async () => {
        const db = fakeDb([
            await row('doc', 11, wrap('지금', '2027-03-02', null)),
            await row('doc@9', 9, wrap('아홉', '2026-03-02', '2026-12-31')),
            await row('doc@10', 10, wrap('열', '2026-06-01', '2026-12-31')),
        ]);
        expect((await openDocFor('sub', ring, db, PID, '2026-07-01'))?.part).toBe('doc@10');
        expect((await openDocFor('sub', ring, db, PID, '2026-04-01'))?.part).toBe('doc@9');
    });
    it('빈틈이면 최신(지금 판)', async () => {
        const db = fakeDb([await row('doc', 5, wrap('가을', '2026-08-24', '2027-02-28')), await row('doc@4', 4, wrap('봄', '2026-03-02', '2026-07-20'))]);
        expect((await openDocFor('sub', ring, db, PID, '2026-08-01'))?.part).toBe('doc');
    });
    it('기간 없는 옛 판(v3 꼴 그대로)은 지금 판 기간 밖의 날을 받는다', async () => {
        const db = fakeDb([await row('doc', 3, wrap('새', '2026-09-01', null)), await row('doc@2', 2, grid('옛'))]);
        const got = await openDocFor('sub', ring, db, PID, '2026-05-01');
        expect(got?.part).toBe('doc@2');
        expect(got?.doc).toMatchObject({ tag: '옛' });
    });
    it('미래 판만 있는 날이면 최신', async () => {
        const db = fakeDb([await row('doc', 2, wrap('내년', '2027-03-02', null))]);
        expect((await openDocFor('sub', ring, db, PID, '2026-11-17'))?.part).toBe('doc');
    });
    it('지금 판 없이 보관 칸만 있어도 고른다', async () => {
        const db = fakeDb([await row('doc@1', 1, wrap('하나', '2026-03-02', null))]);
        expect((await openDocFor('sub', ring, db, PID, '2026-11-17'))?.part).toBe('doc@1');
    });
    it('지금 판이 맞으면 보관 칸은 안 연다(깨진 보관 칸도 안 건드림)', async () => {
        const good = await row('doc', 5, wrap('가을', '2026-08-24', null));
        const broken: Row = { part: 'doc@4', version: 4, ct: new Uint8Array([1, 2, 3]) };
        expect((await openDocFor('sub', ring, fakeDb([good, broken]), PID, '2026-11-17'))?.part).toBe('doc');
        await expect(openDocFor('sub', ring, fakeDb([good, broken]), PID, '2026-05-01')).rejects.toMatchObject({ status: 500, code: 'decrypt_failed' });
    });
    it('보관 칸은 doc@<n> 이름으로 잠겨 있어야 열린다(지금 판 이름으로 잠근 것을 옮겨 놓으면 500)', async () => {
        const moved = await row('doc', 4, wrap('봄', '2026-03-02', '2026-07-20'));
        const db = fakeDb([await row('doc', 5, wrap('가을', '2026-08-24', null)), { ...moved, part: 'doc@4' }]);
        await expect(openDocFor('sub', ring, db, PID, '2026-05-01')).rejects.toMatchObject({ status: 500, code: 'decrypt_failed' });
    });
});

describe('readDocRows', () => {
    it('최신 순(doc → doc@n 큰 쪽)', async () => {
        const db = fakeDb([await row('doc@2', 2, grid('a')), await row('doc', 4, grid('b')), await row('doc@3', 3, grid('c'))]);
        expect((await readDocRows(db, PID)).map((r) => r.part)).toEqual(['doc', 'doc@3', 'doc@2']);
    });
    it('읽기 오류면 던진다', async () => {
        const db: PartsReadDb = { from: () => ({ select: () => ({ eq: () => ({ or: async () => ({ data: null, error: { message: 'x' } }) }) }) }) };
        await expect(readDocRows(db, PID)).rejects.toThrow('parts 읽기 실패');
    });
});
