/**
 * server-link 칸 PUT 큐 (1.2v 설계 ① 12절 · P6) — 칸(part) 하나 = PUT 하나.
 *   고치면 로컬 사본에 dirty 로 두고 2초 모아 `PUT <base>/parts/<part>` + `If-Match: <들고 있는 ETag 그대로>`.
 *   200 → 응답 ETag 를 그 칸 판으로 저장·dirty 지움 · 412 → 그 칸 `conflict`(큐에서 멈춤) · 428 → `error`(클라이언트 버그, 재시도 없음)
 *   네트워크 실패·5xx → `offline`(5·15·60초 뒤 다시, 그다음 60초마다) · 401 → `relogin`(재시도 멈춤, `resume()` 로 다시 연다).
 *   화면·Supabase 연결 없음 — fetch·타이머는 주입식이라 시험에서 가짜 서버로 돈다.
 */
import type { BundleId, LocalCache } from './cache';

/** 고친 칸을 모아 보내기까지 기다리는 시간(ms). */
export const PUT_DEBOUNCE_MS = 2000;
/** 오프라인 재시도 간격(ms) — 가안. 목록을 다 쓰면 마지막 값을 계속 쓴다. */
export const RETRY_DELAYS_MS = [5000, 15000, 60000] as const;

export type PartState = 'clean' | 'dirty' | 'saving' | 'conflict' | 'error';
export type QueueStatus =
    | { kind: 'saved' }
    | { kind: 'saving' }
    | { kind: 'pending'; count: number }
    | { kind: 'offline'; count: number }
    | { kind: 'conflict'; parts: string[] }
    | { kind: 'error'; parts: string[] }
    | { kind: 'relogin' };

export interface PartQueueOptions {
    /** `.../projects/<id>` 처럼 `/parts/<part>` 앞까지. */
    baseUrl: string;
    fetch: typeof fetch;
    /** 로컬 사본 — 주면 고칠 때 dirty 로 두고 200 에 지운다. `id` 와 함께 준다. */
    cache?: LocalCache;
    id?: BundleId;
    headers?: () => Record<string, string>;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (h: unknown) => void;
}

interface Slot {
    body?: unknown;
    etag?: string;
    seq: number;      // 고칠 때마다 +1
    sentSeq: number;  // 마지막으로 서버가 받은 seq
    dirty: boolean;
    inflight: boolean;
    conflict?: { body: unknown };
    error?: string;
    timer?: unknown;
}

const versionOf = (etag?: string) => Number(/\.(\d+)"?$/.exec(etag ?? '')?.[1] ?? 0);

export function createPartQueue(opts: PartQueueOptions) {
    const setT = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearT = opts.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>));
    const slots = new Map<string, Slot>();
    const subs = new Set<() => void>();
    let relogin = false;
    let offline = false;
    let attempt = 0;
    let retryTimer: unknown;
    let io: Promise<unknown> = Promise.resolve();
    const inflight = new Set<Promise<void>>();

    const slot = (p: string): Slot => {
        let s = slots.get(p);
        if (!s) slots.set(p, s = { seq: 0, sentSeq: 0, dirty: false, inflight: false });
        return s;
    };
    const emit = () => subs.forEach(f => f());
    const chain = (f: () => Promise<unknown>) => { io = io.then(f).catch(e => console.warn('[parts] 로컬 사본 쓰기 실패', e)); };
    const blocked = (s: Slot) => !!s.conflict || !!s.error;

    function status(): QueueStatus {
        if (relogin) return { kind: 'relogin' };
        const entries = [...slots.entries()];
        const conflict = entries.filter(([, s]) => s.conflict).map(([p]) => p);
        if (conflict.length) return { kind: 'conflict', parts: conflict };
        const err = entries.filter(([, s]) => s.error).map(([p]) => p);
        if (err.length) return { kind: 'error', parts: err };
        const count = entries.filter(([, s]) => s.dirty && !s.inflight).length;
        if (offline && (count || entries.some(([, s]) => s.inflight))) return { kind: 'offline', count };
        if (entries.some(([, s]) => s.inflight)) return { kind: 'saving' };
        return count ? { kind: 'pending', count } : { kind: 'saved' };
    }

    function schedule(part: string, s: Slot) {
        if (s.timer !== undefined || s.inflight || blocked(s) || relogin || offline) return;
        s.timer = setT(() => { s.timer = undefined; void send(part); }, PUT_DEBOUNCE_MS);
    }

    function goOffline() {
        offline = true;
        if (retryTimer === undefined) {
            const ms = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
            attempt++;
            retryTimer = setT(() => { retryTimer = undefined; void sendAll(); }, ms);
        }
    }

    function sendAll(): Promise<void> {
        const ps: Promise<void>[] = [];
        for (const [p, s] of slots) if (s.dirty) ps.push(send(p));
        return Promise.all(ps).then(() => undefined);
    }

    function send(part: string): Promise<void> {
        const s = slot(part);
        if (s.timer !== undefined) { clearT(s.timer); s.timer = undefined; }
        if (!s.dirty || s.inflight || blocked(s) || relogin) return Promise.resolve();
        s.inflight = true;
        const seq = s.seq;
        const body = s.body;
        emit();
        const p = (async () => {
            try {
                const headers: Record<string, string> = { 'Content-Type': 'application/json', ...opts.headers?.() };
                if (s.etag) headers['If-Match'] = s.etag;
                const res = await opts.fetch(`${opts.baseUrl}/parts/${encodeURIComponent(part)}`, {
                    method: 'PUT', headers, body: JSON.stringify(body),
                });
                s.inflight = false;
                if (res.status === 200) {
                    offline = false; attempt = 0;
                    if (retryTimer !== undefined) { clearT(retryTimer); retryTimer = undefined; }
                    const etag = res.headers.get('ETag');
                    if (etag) s.etag = etag;
                    s.sentSeq = seq;
                    if (s.seq === seq) {
                        s.dirty = false;
                        const { cache, id } = opts;
                        if (cache && id) chain(async () => {
                            await cache.writePart(id, part, { version: versionOf(s.etag), body });
                            await cache.clearDirty(id, part);
                        });
                    } else schedule(part, s); // 보내는 사이 또 고쳤다 — 새 판으로 다시
                } else if (res.status === 412) {
                    s.conflict = { body: await res.json().catch(() => undefined) };
                } else if (res.status === 428) {
                    s.error = '428';
                    console.warn(`[parts] ${part}: 서버가 If-Match 없음(428)을 돌려줌 — 클라이언트 버그, 재시도 안 함`);
                } else if (res.status === 401) {
                    relogin = true;
                } else if (res.status === 503 || res.status >= 500) {
                    goOffline();
                } else {
                    s.error = String(res.status);
                    console.warn(`[parts] ${part}: 예상 밖 응답 ${res.status} — 재시도 안 함`);
                }
            } catch {
                s.inflight = false;
                goOffline();
            }
            emit();
        })();
        inflight.add(p);
        void p.finally(() => inflight.delete(p));
        return p;
    }

    return {
        /** 서버에서 받은 칸의 판을 알려 준다(`"<epoch>.<version>"` 그대로). */
        seed(part: string, etag: string) { slot(part).etag = etag; },
        /** 칸을 고쳤다 — 사본에 dirty 로 두고 2초 뒤 보낸다. */
        edit(part: string, body: unknown) {
            const s = slot(part);
            s.body = body; s.seq++; s.dirty = true;
            const { cache, id } = opts;
            if (cache && id) { const version = versionOf(s.etag); chain(() => cache.markDirty(id, part, { version, body })); }
            schedule(part, s);
            emit();
        },
        /** 모아 둔 것을 지금 바로 보낸다(Ctrl+S). 보낸 것이 끝나면 풀린다. */
        async flush(): Promise<void> {
            if (retryTimer !== undefined) { clearT(retryTimer); retryTimer = undefined; }
            await sendAll();
            while (inflight.size) await Promise.all([...inflight]);
            await io;
        },
        /** 다시 로그인한 뒤 — relogin 을 풀고 남은 것을 보낸다. */
        resume(): Promise<void> { relogin = false; emit(); return sendAll(); },
        status,
        /** 그 칸 상태와 서버가 준 본문(412 일 때). */
        partInfo(part: string): { state: PartState; serverBody?: unknown; etag?: string } {
            const s = slots.get(part);
            if (!s) return { state: 'clean' };
            const state: PartState = s.conflict ? 'conflict' : s.error ? 'error' : s.inflight ? 'saving' : s.dirty ? 'dirty' : 'clean';
            return { state, serverBody: s.conflict?.body, etag: s.etag };
        },
        subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; },
        /** 시험·정리용 — 모든 타이머를 멈춘다. */
        dispose() {
            for (const s of slots.values()) if (s.timer !== undefined) { clearT(s.timer); s.timer = undefined; }
            if (retryTimer !== undefined) { clearT(retryTimer); retryTimer = undefined; }
        },
    };
}

export type PartQueue = ReturnType<typeof createPartQueue>;
