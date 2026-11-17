// 함수 `admin-ops` 판정(순수 — 저장소·열쇠 글·시계는 주입). 관리자만. ④ 6-1·6-3·7-3 · ② 2-3(함수 표).
//   GET  /admin-ops/verify                         → 6-1 검사 1~4 결과(200 {ok, …} — 실패여도 200 으로 번호를 알려 준다)
//   GET  /admin-ops/kids[?after=<커서>&carry=k1:3]  → 훑은 토막의 kid 별 건수(carry 를 더해 돌려줌) + next
//   POST /admin-ops/kids?save=1&confirm=kids …     → 끝 토막(next null)이면 meta.kids_in_use 를 건수>0 인 kid 로 채운다
//   POST /admin-ops/rewrap?confirm=rewrap[&after=]  → 옛 kid 암호문을 쓰기 키로 다시 잠근 토막 + next(이어 부르기)
//   POST /admin-ops/bump-epoch?confirm=bump-epoch   → 전 프로젝트 data_epoch 새 무작위(옛 ETag 는 parts PUT 에서 412)
// 한 호출은 rewrap.ts 의 상한(행 수·벽시계)에서 멈춘다 — 설계 한도 150초 밑.
// 값(키·평문)은 응답·오류에 싣지 않는다. 상태를 바꾸는 길은 `confirm=<동작 이름>` 이 있어야 한다(실수 방지).

import { requireUser, type AuthClient } from '../_shared/auth.ts';
import { readKid, type KeyRing } from '../_shared/crypto/envelope.ts';
import { checkKeys, KeyCheckError } from '../_shared/crypto/keys.ts';
import { errors, HttpError, jsonResponse } from '../_shared/errors.ts';
import { handle, subPath } from '../_shared/http.ts';
import { formatEtag } from '../parts/etag.ts';
import { decodeCursor, rewrapSlice, walk, type Budget } from './rewrap.ts';
import type { AdminStore } from './store.ts';

export const FN_NAME = 'admin-ops';

export interface AdminDeps {
    auth: AuthClient;
    store: AdminStore;
    /** `TT_OPS_KEYS` 원문(keys.ts loadKeyText) */
    keyText(): string | undefined;
    /** 새 epoch 글자(ETag 앞자리 꼴 `[A-Za-z0-9_-]{1,64}`) */
    newEpoch(): string;
    /** 상한 조정(시험) · now 는 시계 */
    budget: Budget;
    allowedOrigin: string | undefined;
}

const err = {
    notAdmin: () => new HttpError(403, 'not_admin', '관리자만 쓸 수 있습니다'),
    confirm: (what: string) => new HttpError(400, 'confirm_required', `confirm=${what} 이 필요합니다`),
    badCursor: () => new HttpError(400, 'bad_cursor', 'after 꼴이 아닙니다'),
    badCarry: () => new HttpError(400, 'bad_carry', 'carry 꼴이 아닙니다'),
    keyCheck: (n: number) => new HttpError(503, 'key_check', `키 검사 ${n} 에서 멈췄습니다`, { n }),
};

async function adminOnly(deps: AdminDeps, req: Request): Promise<void> {
    const uid = await requireUser(deps.auth, req.headers.get('Authorization'));
    if (!(await deps.store.isAdmin(uid))) throw err.notAdmin();
}

/** 열쇠 검사를 거친 KeyRing — 걸리면 503 key_check {n} */
async function ringOr503(deps: AdminDeps): Promise<{ ring: KeyRing; kidsInUse: string[] }> {
    const kidsInUse = await deps.store.kidsInUse();
    try {
        const ring = await checkKeys({ text: deps.keyText(), kidsInUse, sample: await deps.store.sample() });
        return { ring, kidsInUse };
    } catch (e) {
        if (e instanceof KeyCheckError) throw err.keyCheck(e.n);
        throw e;
    }
}

function needConfirm(url: URL, what: string): void {
    if (url.searchParams.get('confirm') !== what) throw err.confirm(what);
}

const CARRY_RE = /^[A-Za-z0-9_-]{1,32}:\d{1,12}$/;
function parseCarry(q: string | null): Map<string, number> {
    const m = new Map<string, number>();
    if (!q) return m;
    for (const item of q.split(',')) {
        if (!CARRY_RE.test(item)) throw err.badCarry();
        const [k, n] = item.split(':');
        m.set(k, (m.get(k) ?? 0) + Number(n));
    }
    return m;
}

// ── 동작 ──────────────────────────────────────────────────

async function verify(deps: AdminDeps): Promise<Response> {
    const kidsInUse = await deps.store.kidsInUse();
    try {
        const text = deps.keyText();
        const ring = await checkKeys({ text, kidsInUse, sample: await deps.store.sample() });
        return jsonResponse({ ok: true, writeKid: ring.writeKid, kids: [...ring.keys.keys()], kidsInUse });
    } catch (e) {
        if (e instanceof KeyCheckError) return jsonResponse({ ok: false, check: e.n });
        throw e;
    }
}

async function kids(deps: AdminDeps, req: Request, url: URL): Promise<Response> {
    const save = req.method.toUpperCase() === 'POST' && url.searchParams.get('save') === '1';
    if (save) needConfirm(url, 'kids');
    const from = decodeCursor(url.searchParams.get('after'));
    if (!from) throw err.badCursor();
    const counts = parseCarry(url.searchParams.get('carry'));
    let bad = 0;
    const w = await walk(deps.store, from, deps.budget, async (_t, it) => {
        try {
            const k = readKid(it.ct);
            counts.set(k, (counts.get(k) ?? 0) + 1);
        } catch {
            bad += 1;
        }
    });
    const out: Record<string, unknown> = { counts: Object.fromEntries(counts), scanned: w.scanned, unreadable: bad, next: w.next };
    if (save && w.next === null) {
        const used = [...counts.entries()].filter(([, n]) => n > 0).map(([k]) => k).sort();
        await deps.store.setKidsInUse(used);
        out.saved = used;
    }
    return jsonResponse(out);
}

async function rewrap(deps: AdminDeps, url: URL): Promise<Response> {
    needConfirm(url, 'rewrap');
    const from = decodeCursor(url.searchParams.get('after'));
    if (!from) throw err.badCursor();
    const { ring, kidsInUse } = await ringOr503(deps);
    // 쓰기 키 줄이 meta 에 없으면 먼저 더한다 — 다시 잠근 행이 생기기 전에(검사 3 이 어긋나지 않게 합집합만)
    if (!kidsInUse.includes(ring.writeKid)) await deps.store.setKidsInUse([...kidsInUse, ring.writeKid].sort());
    const slice = await rewrapSlice(deps.store, ring, from, deps.budget);
    return jsonResponse({ writeKid: ring.writeKid, ...slice });
}

async function bumpEpoch(deps: AdminDeps, url: URL): Promise<Response> {
    needConfirm(url, 'bump-epoch');
    const ids = await deps.store.projectIds();
    for (const id of ids) {
        const epoch = deps.newEpoch();
        formatEtag(epoch, 0); // 꼴 검사(틀리면 던져 500 — 쓰기 전에)
        await deps.store.setEpoch(id, epoch);
    }
    return jsonResponse({ projects: ids.length });
}

export function adminHandler(deps: AdminDeps): (req: Request) => Promise<Response> {
    return (req) =>
        handle(req, deps.allowedOrigin, async (r) => {
            const p = subPath(r.url, FN_NAME);
            const method = r.method.toUpperCase();
            const url = new URL(r.url);
            if (p.length !== 1) throw errors.notFound();
            const allow: Record<string, string[]> = {
                verify: ['GET'], kids: ['GET', 'POST'], rewrap: ['POST'], 'bump-epoch': ['POST'],
            };
            const ok = allow[p[0]];
            if (!ok) throw errors.notFound();
            if (!ok.includes(method)) throw errors.methodNotAllowed();
            await adminOnly(deps, r);
            switch (p[0]) {
                case 'verify': return verify(deps);
                case 'kids': return kids(deps, r, url);
                case 'rewrap': return rewrap(deps, url);
                default: return bumpEpoch(deps, url);
            }
        });
}

