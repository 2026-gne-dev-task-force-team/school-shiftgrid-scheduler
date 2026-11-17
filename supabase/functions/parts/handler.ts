// 함수 `parts` 판정(순수 — 저장소·키·인증 클라이언트는 주입). ③ 11-2 · ④ 1절 · 5-3 · 5-4.
//   GET /parts/projects/:pid[?known=<조각>:<epoch>.<version>,…] → 200 {epoch, parts:{<조각>:{version, etag, fmt, body}}, unchanged:[…]}
//   PUT /parts/projects/:pid/parts/:part[?archive=1] + If-Match: "<epoch>.<version>" · 본문 {fmt, body}
//       → 200 {version} + ETag. 차례(④ 5-3): 역할 403 → If-Match 428 → 크기 413 → 판 번호 412 → fmt 400 → 검사(B7 자리) → 조건부 쓰기 412.
// 거부되면 아무것도 바꾸지 않는다. 로그·오류 응답에 본문을 싣지 않는다.

import { requireProjectMember, type AuthClient } from '../_shared/auth.ts';
import { EnvelopeError, type Bytes, type KeyRing } from '../_shared/crypto/envelope.ts';
import { errors, HttpError, jsonResponse } from '../_shared/errors.ts';
import { handle, subPath } from '../_shared/http.ts';
import type { Role } from '../../../shared/roles.ts';
import { checkPartSize, plainSize } from '../../../shared/check/limits.ts';
import { canReadPart, canWritePart, isWritablePart } from './access.ts';
import { formatEtag, parseKnown, parseTag, sameTag } from './etag.ts';
import { openPart, sealPart, type PartPlain, type PartRow, type PartsStore } from './store.ts';

export const FN_NAME = 'parts';

/** B7(zod·차이 규칙) 자리 — 걸린 규칙 id 목록을 돌려준다(빈 목록 = 통과). 옛 판은 없으면 null. */
export type PartCheck = (input: { part: string; roles: readonly Role[]; next: PartPlain; prev: PartPlain | null }) => string[] | Promise<string[]>;

export interface PartsDeps {
    auth: AuthClient;
    store: PartsStore;
    /** 콜드 스타트 키 검사(keys.ts ensureKeys) 를 감싼 것 */
    keys(): Promise<KeyRing>;
    allowedOrigin: string | undefined;
    /** 지금 함수가 받는 조각 꼴 판(④ 5-1). 없는 조각은 1 만 받는다. */
    acceptFmt?: (part: string) => readonly number[];
    check?: PartCheck;
}

const err = {
    preconditionRequired: () => new HttpError(428, 'precondition_required', 'If-Match 머리가 필요합니다'),
    conflict: (version: number) => new HttpError(412, 'version_conflict', '다른 곳에서 먼저 고쳤습니다', { version }),
    tooLarge: (part: string, limit: number, size: number) =>
        new HttpError(413, 'part_too_large', '조각이 한도를 넘습니다', { part, limit, size }),
    forbidden: () => new HttpError(403, 'forbidden', '이 조각을 쓸 역할이 아닙니다'),
    badBody: () => new HttpError(400, 'bad_body', '본문은 {fmt, body} JSON 이어야 합니다'),
    fmtMismatch: (fmt: number) => new HttpError(400, 'fmt_mismatch', '받지 않는 조각 꼴 판입니다', { fmt }),
    archiveOnlyDoc: () => new HttpError(400, 'archive_only_doc', 'archive=1 은 doc 교체에만 씁니다'),
    checkFailed: (rules: string[]) => new HttpError(400, 'check_failed', '검사에 걸렸습니다', { rules }),
    decryptFailed: () => new HttpError(500, 'decrypt_failed', '조각을 열지 못했습니다'),
};

async function openOr500(ring: KeyRing, pid: string, part: string, version: number, ct: Parameters<typeof openPart>[4]) {
    try {
        return await openPart(ring, pid, part, version, ct);
    } catch (e) {
        if (e instanceof EnvelopeError) console.error(`decrypt_failed part=${part}`);
        throw err.decryptFailed();
    }
}

async function needEpoch(store: PartsStore, pid: string): Promise<string> {
    const epoch = await store.epoch(pid);
    if (!epoch) throw errors.notFound();
    return epoch;
}

async function getParts(deps: PartsDeps, req: Request, pid: string): Promise<Response> {
    const m = await requireProjectMember(deps.auth, req.headers.get('Authorization'), pid);
    const epoch = await needEpoch(deps.store, pid);
    const known = parseKnown(new URL(req.url).searchParams.get('known'));
    const rows = (await deps.store.list(pid)).filter((r) => canReadPart(m.roles, r.part));
    const parts: Record<string, { version: number; etag: string; fmt: number; body: unknown }> = {};
    const unchanged: string[] = [];
    let ring: KeyRing | null = null;
    for (const r of rows) {
        const k = known.get(r.part);
        if (k && sameTag(k, { epoch, version: r.version })) {
            unchanged.push(r.part);
            continue;
        }
        ring ??= await deps.keys();
        const plain = await openOr500(ring, pid, r.part, r.version, r.ct);
        parts[r.part] = { version: r.version, etag: formatEtag(epoch, r.version), fmt: plain.fmt, body: plain.body };
    }
    return jsonResponse({ epoch, parts, unchanged });
}

function readPlain(text: string): PartPlain {
    let v: unknown;
    try {
        v = JSON.parse(text);
    } catch {
        throw err.badBody();
    }
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw err.badBody();
    const o = v as Record<string, unknown>;
    if (!Number.isSafeInteger(o.fmt) || (o.fmt as number) < 1 || !('body' in o)) throw err.badBody();
    return { fmt: o.fmt as number, body: o.body };
}

/** putAtomic 이 없는 저장소(시험 가짜 등) — 보관 먼저, 그다음 조건부 쓰기. 한 트랜잭션이 아니다. */
async function putTwoStep(
    store: PartsStore, pid: string, part: string, exists: boolean, from: number, size: number, ct: Bytes, archived: PartRow | null,
): Promise<boolean> {
    if (archived) await store.putArchive(pid, archived);
    return exists ? store.update(pid, part, from, { sizePlain: size, ct }) : store.insertFirst(pid, { part, sizePlain: size, ct });
}

async function putPart(deps: PartsDeps, req: Request, pid: string, part: string): Promise<Response> {
    const m = await requireProjectMember(deps.auth, req.headers.get('Authorization'), pid);
    if (!isWritablePart(part)) throw errors.notFound(); // 모르는 조각·보관 doc@<n> (③ 11-2 「없는 칸 = 404」)
    const archive = new URL(req.url).searchParams.get('archive') === '1';
    if (archive && part !== 'doc') throw err.archiveOnlyDoc();
    // 1 역할
    if (!canWritePart(m.roles, part)) throw err.forbidden();
    // 2 If-Match
    const ifMatch = req.headers.get('If-Match');
    if (ifMatch === null || ifMatch.trim() === '') throw err.preconditionRequired();
    // 3 크기 — 머리로 먼저 거르고(큰 본문을 다 받지 않게) 받은 바이트로 다시 잰다
    const declared = Number(req.headers.get('Content-Length') ?? NaN);
    if (Number.isFinite(declared)) {
        const pre = checkPartSize(part, declared);
        if (!pre.ok) throw err.tooLarge(part, pre.limit, pre.size);
    }
    const text = await req.text();
    const size = plainSize(text);
    const verdict = checkPartSize(part, size);
    if (!verdict.ok) throw err.tooLarge(part, verdict.limit, verdict.size);
    // 4 판 번호 미리 비교
    const epoch = await needEpoch(deps.store, pid);
    const cur = await deps.store.get(pid, part);
    const curVersion = cur?.version ?? 0;
    const tag = parseTag(ifMatch);
    if (!tag || !sameTag(tag, { epoch, version: curVersion })) throw err.conflict(curVersion);
    // 5 fmt
    const next = readPlain(text);
    const accept = deps.acceptFmt?.(part) ?? [1];
    if (!accept.includes(next.fmt)) throw err.fmtMismatch(next.fmt);
    // 6 검사(B7 자리) — 옛 판은 검사가 있을 때만 연다
    const ring = await deps.keys();
    let prev: PartPlain | null = null;
    if (cur && (deps.check || archive)) prev = await openOr500(ring, pid, part, cur.version, cur.ct);
    if (deps.check) {
        const rules = await deps.check({ part, roles: m.roles, next, prev });
        if (rules.length > 0) {
            console.error(`check_failed part=${part} rules=${rules.join(',')}`);
            throw err.checkFailed(rules);
        }
    }
    // 7 쓰기 — archive=1 이면 옛 doc 을 `doc@<옛 version>` 으로 다시 잠가 먼저 남긴다(AAD 에 이름이 들어가 복사가 아니다)
    //   저장소에 putAtomic(RPC parts_put)이 있으면 판 비교·보관·덮기를 한 트랜잭션으로, 없으면 옛 두 걸음.
    let archivedAs: string | undefined;
    let archived: PartRow | null = null;
    if (archive && cur && prev) {
        archivedAs = `doc@${cur.version}`;
        const ct = await sealPart(ring, pid, archivedAs, cur.version, prev);
        archived = { part: archivedAs, version: cur.version, sizePlain: cur.sizePlain, ct };
    }
    const newVersion = curVersion + 1;
    const ct = await sealPart(ring, pid, part, newVersion, next);
    const ok = deps.store.putAtomic
        ? await deps.store.putAtomic(pid, { part, epoch, from: curVersion, sizePlain: size, ct, archive: archived })
        : await putTwoStep(deps.store, pid, part, cur !== null, curVersion, size, ct, archived);
    if (!ok) {
        const now = await deps.store.get(pid, part);
        throw err.conflict(now?.version ?? 0);
    }
    // 8 감사 한 줄({part, from, to, archivedAs}) — 감사 쓰기 바닥이 생기면 여기(같은 트랜잭션은 RPC 몫)
    const etag = formatEtag(epoch, newVersion);
    return jsonResponse({ version: newVersion, etag, ...(archivedAs ? { archivedAs } : {}) }, 200, { ETag: etag });
}

export function partsHandler(deps: PartsDeps): (req: Request) => Promise<Response> {
    return (req) =>
        handle(req, deps.allowedOrigin, async (r) => {
            const p = subPath(r.url, FN_NAME);
            const method = r.method.toUpperCase();
            if (p[0] !== 'projects' || !p[1]) throw errors.notFound();
            if (p.length === 2) {
                if (method !== 'GET') throw errors.methodNotAllowed();
                return getParts(deps, r, p[1]);
            }
            if (p.length === 4 && p[2] === 'parts') {
                if (method !== 'PUT') throw errors.methodNotAllowed();
                return putPart(deps, r, p[1], p[3]);
            }
            throw errors.notFound();
        });
}
