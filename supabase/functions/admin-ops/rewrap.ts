// ④ 6-3 회전 — 옛 kid 암호문을 쓰기 키로 다시 잠근다(AAD 에 kid 가 들어가므로 복사가 아니라 열고 다시 잠금).
// 한 호출은 처리량 상한(행 수·벽시계)까지만 하고 「다음 자리」(커서)를 돌려준다 — 부르는 쪽이 이어 부른다.
// 평문은 안 바뀐다(rewrap 시험이 「열어 보니 전과 같다」를 잰다). 이 파일이 감사 암호문 열을 다시 쓰는 유일한 길이다.

import { open, readKid, seal, type KeyRing } from '../_shared/crypto/envelope.ts';
import { TARGETS, type AdminStore, type Target } from './store.ts';

/** 한 호출이 훑을 행 수 상한(CPU 2초 한도 안 — AES-GCM 열고 닫기만이라 가볍다) */
export const REWRAP_MAX_ROWS = 400;
/** 한 번에 읽는 행 수 */
export const REWRAP_PAGE = 100;
/** 한 호출 벽시계 상한(ms) — 설계 한도 150초 밑에 여유를 둔다 */
export const CALL_BUDGET_MS = 100_000;

export interface Cursor {
    idx: number;
    after: string | null;
}

/** 커서 = `<대상 번호>:<마지막 key>` */
export function encodeCursor(c: Cursor): string {
    return `${c.idx}:${c.after ?? ''}`;
}
/** null·빈 글자 = 처음 · 꼴이 틀리면 null(호출자가 400) */
export function decodeCursor(text: string | null): Cursor | null {
    if (text === null || text === '') return { idx: 0, after: null };
    const i = text.indexOf(':');
    if (i < 1) return null;
    const idx = Number(text.slice(0, i));
    if (!Number.isInteger(idx) || idx < 0 || idx >= TARGETS.length) return null;
    const key = text.slice(i + 1);
    return { idx, after: key === '' ? null : key };
}

export interface Budget {
    now(): number;
    maxRows?: number;
    budgetMs?: number;
    page?: number;
}

/** 훑기 한 토막의 공통 뼈대 — visit 이 한 칸을 처리한다. 상한에 닿으면 다음 커서를 돌려준다. */
export async function walk(
    store: AdminStore,
    from: Cursor,
    b: Budget,
    visit: (t: Target, it: { key: string; ct: Uint8Array<ArrayBuffer>; aadFor: (kid: string) => string }) => Promise<void>,
): Promise<{ scanned: number; next: string | null }> {
    const maxRows = b.maxRows ?? REWRAP_MAX_ROWS;
    const budgetMs = b.budgetMs ?? CALL_BUDGET_MS;
    const page = b.page ?? REWRAP_PAGE;
    const start = b.now();
    let scanned = 0;
    let { idx, after } = from;
    while (idx < TARGETS.length) {
        const t: Target = TARGETS[idx];
        const items = await store.page(t, after, Math.min(page, maxRows - scanned));
        if (items.length === 0) {
            idx += 1;
            after = null;
            continue;
        }
        for (const it of items) {
            scanned += 1;
            after = it.key;
            await visit(t, it);
        }
        if (scanned >= maxRows || b.now() - start >= budgetMs) return { scanned, next: encodeCursor({ idx, after }) };
    }
    return { scanned, next: null };
}

export interface Slice {
    scanned: number;
    rewrapped: number;
    /** 이미 쓰기 키 */
    already: number;
    /** 그 사이 다른 쓰기가 있어 건너뜀(다시 돌리면 잡힌다) */
    skipped: number;
    /** 못 연 칸 — `<표>/<key>` 만(값 없음) */
    failed: string[];
    /** 이어 부를 커서 · 끝이면 null */
    next: string | null;
}

export async function rewrapSlice(store: AdminStore, ring: KeyRing, from: Cursor, b: Budget): Promise<Slice> {
    const out: Slice = { scanned: 0, rewrapped: 0, already: 0, skipped: 0, failed: [], next: null };
    const w = await walk(store, from, b, async (t, it) => {
        let kid: string;
        try {
            kid = readKid(it.ct);
        } catch {
            out.failed.push(`${t}/${it.key}`);
            return;
        }
        if (kid === ring.writeKid) {
            out.already += 1;
            return;
        }
        let fresh: Uint8Array<ArrayBuffer>;
        try {
            fresh = await seal(ring, await open(ring, it.ct, it.aadFor), it.aadFor);
        } catch {
            out.failed.push(`${t}/${it.key}`); // 열기·닫기 실패 — 키·AAD 가 안 맞음
            return;
        }
        // DB 오류는 던진다(500)
        if (await store.swap(t, it.key, it.ct, fresh)) out.rewrapped += 1;
        else out.skipped += 1;
    });
    out.scanned = w.scanned;
    out.next = w.next;
    return out;
}
