// Deno 진입점(얇은 자리) — 판정은 handler.ts · 저장은 store.ts. 이 파일은 Node 시험에서 import 하지 않는다.
// supabase-js 는 `npm:` 지정자로 실행 때 불러온다(Node tsc 가 해석하지 않게 문자열 변수로).
// ⚠️ 아직 안 이은 두 자리(보고 🙋): ① `doc` 에서 그날 시각·정규 배치를 뽑는 읽기(context.day · timeLabels) → 501
//    ② 감사 `audit.append`(B10 의 `_shared/audit.ts`) → 501 — 그래서 취소는 B10 전까지 지우지 않고 멈춘다(감사 먼저 규칙).

import type { Room, RoomBlock, RoomFixed } from '../../../shared/room-rules.ts';
import type { AuthClient } from '../_shared/auth.ts';
import { loadAllowedOrigin } from '../_shared/cors.ts';
import { aadPart, aadUser } from '../_shared/crypto/aad.ts';
import { open, openText, type Bytes } from '../_shared/crypto/envelope.ts';
import { ensureKeys } from '../_shared/crypto/keys.ts';
import { systemClock } from '../_shared/clock.ts';
import { HttpError } from '../_shared/errors.ts';
import { roomsHandler, type RoomsContext, type RoomsData } from './handler.ts';
import { createRoomStore, supabaseRoomDb } from './store.ts';

interface DenoLike {
    env: { get(name: string): string | undefined };
    serve(h: (req: Request) => Promise<Response>): unknown;
}
// supabase-js 의 체인은 모양이 넓어 이 파일 안에서만 느슨하게 받는다(판정 코드로 새지 않는다).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const SUPABASE_JS = 'npm:@supabase/supabase-js@2';
const deno = (globalThis as unknown as { Deno: DenoLike }).Deno;

function fromPg(v: unknown): Bytes {
    const s = String(v);
    if (!s.startsWith('\\x')) throw new Error('bytea 꼴이 아닙니다');
    const out = new Uint8Array(new ArrayBuffer((s.length - 2) / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 + i * 2, 4 + i * 2), 16);
    return out;
}
async function gunzip(b: Bytes): Promise<string> {
    const stream = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
}

let handler: ((req: Request) => Promise<Response>) | undefined;

async function build(): Promise<(req: Request) => Promise<Response>> {
    const url = deno.env.get('SUPABASE_URL');
    const key = deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('SUPABASE_URL·SERVICE_ROLE_KEY 가 없습니다');
    const mod = (await import(SUPABASE_JS)) as { createClient(u: string, k: string, o: object): Sb };
    const sb = mod.createClient(url, key, { auth: { persistSession: false } });
    // 키 검사 3·4(kids_in_use · 표본 열기)는 meta 읽기가 이어질 때 채운다 — 지금은 줄꼴 검사(1·2)까지.
    const ring = await ensureKeys(async () => ({ kidsInUse: [], sample: null }));

    const context: RoomsContext = {
        async data(projectId): Promise<RoomsData> {
            const { data, error } = await sb.from('parts').select('version, ct').eq('project_id', projectId).eq('part', 'ops.rooms').maybeSingle();
            if (error) throw new Error('parts 읽기 실패');
            if (!data) return { rooms: [], fixed: [], blocks: [] };
            const ct = fromPg(data.ct);
            const plain = await open(ring, ct, (kid) => aadPart(projectId, 'ops.rooms', data.version, kid));
            const body = (JSON.parse(await gunzip(plain)) as { body?: Partial<{ rooms: Room[]; fixed: RoomFixed[]; blocks: RoomBlock[] }> }).body ?? {};
            return { rooms: body.rooms ?? [], fixed: body.fixed ?? [], blocks: body.blocks ?? [] };
        },
        day() {
            throw new HttpError(501, 'not_wired', '그날 수업 시각 읽기(doc)가 아직 이어지지 않았습니다');
        },
        timeLabels() {
            throw new HttpError(501, 'not_wired', '시간 틀 읽기(doc)가 아직 이어지지 않았습니다');
        },
        async userName(projectId, userId) {
            const { data, error } = await sb.from('project_members').select('display_ct').eq('project_id', projectId).eq('user_id', userId).maybeSingle();
            if (error || !data?.display_ct) throw new Error('구성원 표시명 읽기 실패');
            return await openText(ring, fromPg(data.display_ct), (kid) => aadUser(userId, kid));
        },
    };

    return roomsHandler({
        allowedOrigin: loadAllowedOrigin(),
        auth: sb as AuthClient,
        store: createRoomStore(supabaseRoomDb(sb), ring),
        context,
        audit() {
            throw new HttpError(501, 'not_wired', '감사 기록(audit.append · B10)이 아직 이어지지 않았습니다');
        },
        clock: systemClock,
        newId: () => crypto.randomUUID(),
    });
}

deno.serve(async (req) => {
    try {
        handler ??= await build();
    } catch {
        return new Response(JSON.stringify({ error: { code: 'internal', message: '서버 오류입니다' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        });
    }
    return handler(req);
});
