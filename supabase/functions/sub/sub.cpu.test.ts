// B9 CPU 실측(② 9절 B9 줄): 덩어리 `doc` 694 KB(gzip) 열기 — AES-GCM 복호 + gunzip + JSON.parse — 와 62일 행 복호.
// Edge Function 한도는 CPU 2초/요청. Deno 가 이 기기에 없어 Node(같은 V8 · WebCrypto · DecompressionStream)로 잰다.
// ⚠️ 2초를 넘으면 설계의 실패 분기: 「그날 입력」 캐시(① 8절)를 `meta` 표 암호문으로 — claim 이 doc 을 안 열게.
import { beforeAll, describe, expect, it } from 'vitest';
import { aadPart } from '../_shared/crypto/aad.ts';
import { open, seal, type Bytes, type KeyRing } from '../_shared/crypto/envelope.ts';
import { buildKeyRing, parseKeys } from '../_shared/crypto/keys.ts';
import { openSlots, sealSlot, type DbSlot, type SubSlotRow } from './rows.ts';

const DOC_GZ_BYTES = 694 * 1024;
const DAYS = 62;
const ROWS_PER_DAY = 50;          // 62일 × 50 = 3,100행(「수천 행」) · 절반은 맡은 이(take) 봉투까지
export const CPU_LIMIT_MS = 2000;

let ring: KeyRing;
beforeAll(async () => {
    const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    ring = await buildKeyRing(parseKeys(`k1:${raw}`));
});

async function pipe(bytes: Bytes, t: CompressionStream | DecompressionStream): Promise<Bytes> {
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(t)).arrayBuffer();
    return new Uint8Array(buf);
}

/** 시간표 덩어리 비슷한 JSON(반·칸·사람 · 섞인 글) — gzip 이 694 KB 가 될 때까지 늘린다 */
function fakeDoc(items: number): string {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const word = () => Math.floor(rnd() * 36 ** 6).toString(36);
    const lessons = Array.from({ length: items }, (_, i) => ({
        id: `l${i}`, track: `${1 + (i % 6)}-${1 + (i % 5)}`, day: i % 5, startMin: 540 + (i % 7) * 50, endMin: 580 + (i % 7) * 50,
        subject: ['국어', '수학', '사회', '과학', '영어', '음악', '체육'][i % 7], teacherIds: [`agent:${word()}`], coIds: rnd() < 0.2 ? [`aux:${word()}`] : [],
        note: `${word()} ${word()} ${word()}`,
    }));
    return JSON.stringify({ version: 1, lessons });
}

async function buildDoc(): Promise<{ gz: Bytes; items: number }> {
    const enc = new TextEncoder();
    const probe = 2000;
    const probeGz = await pipe(enc.encode(fakeDoc(probe)), new CompressionStream('gzip'));
    const items = Math.round((probe * DOC_GZ_BYTES) / probeGz.length);
    return { gz: await pipe(enc.encode(fakeDoc(items)), new CompressionStream('gzip')), items };
}

function fakeRows(): SubSlotRow[] {
    const out: SubSlotRow[] = [];
    for (let d = 0; d < DAYS; d++) {
        const date = new Date(Date.UTC(2026, 10, 17 + d)).toISOString().slice(0, 10);
        for (let k = 0; k < ROWS_PER_DAY; k++) {
            out.push({
                id: `r${d}-${k}`, projectId: 'p1', date, trackName: `${1 + (k % 6)}-${1 + (k % 5)}`, startMin: 540 + k, endMin: 585 + k,
                status: k % 2 ? '확정' : '대기', createdAt: '2026-11-17T00:00:00Z', updatedAt: '2026-11-17T00:00:00Z',
                body: {
                    absentRef: `agent:t${k}`, absentName: '가교사', registeredByName: '나교사', registeredBy: 'u-x', label: '',
                    subject: '국어', reason: '출장', memo: '교과서 12쪽부터', allDay: false, preApproved: false,
                },
                take: k % 2 ? { takerRef: `agent:s${k}`, takerName: '다교사', takerUserId: 'u-y', confirmedAt: '2026-11-17T00:00:00Z' } : null,
            });
        }
    }
    return out;
}

const cpuMs = (u: NodeJS.CpuUsage) => (u.user + u.system) / 1000;

describe('B9 CPU 실측 — doc 열기 + 62일 행 복호', () => {
    it(`합이 CPU ${CPU_LIMIT_MS}ms 안`, async () => {
        const { gz, items } = await buildDoc();
        const aad = (kid: string) => aadPart('p1', 'doc', 1, kid);
        const docCt = await seal(ring, gz, aad);
        const rows: DbSlot[] = await Promise.all(fakeRows().map((r) => sealSlot(ring, r)));

        const openDoc = async () => JSON.parse(new TextDecoder().decode(await pipe(await open(ring, docCt, aad), new DecompressionStream('gzip')))) as { lessons: unknown[] };
        await openDoc(); await openSlots(ring, rows);           // 데우기(JIT) — 함수 첫 요청은 이보다 느릴 수 있다

        const runs: { doc: number; rows: number; wall: number }[] = [];
        for (let i = 0; i < 3; i++) {
            const t0 = performance.now();
            const c0 = process.cpuUsage();
            const doc = await openDoc();
            const c1 = process.cpuUsage(c0);
            const opened = await openSlots(ring, rows);
            const c2 = process.cpuUsage(c0);
            runs.push({ doc: cpuMs(c1), rows: cpuMs(c2) - cpuMs(c1), wall: performance.now() - t0 });
            expect(doc.lessons).toHaveLength(items);
            expect(opened).toHaveLength(DAYS * ROWS_PER_DAY);
        }
        const worst = runs.reduce((a, b) => (a.doc + a.rows >= b.doc + b.rows ? a : b));
        console.log(`[B9 CPU] doc gzip ${(gz.length / 1024).toFixed(0)} KB(항목 ${items}) · 행 ${rows.length}개 · 3회 최악: doc ${worst.doc.toFixed(0)}ms + 행 ${worst.rows.toFixed(0)}ms = CPU ${(worst.doc + worst.rows).toFixed(0)}ms · 벽시계 ${worst.wall.toFixed(0)}ms`);
        expect(gz.length).toBeGreaterThan(DOC_GZ_BYTES * 0.95);
        expect(worst.doc + worst.rows).toBeLessThan(CPU_LIMIT_MS);
    }, 120_000);
});
