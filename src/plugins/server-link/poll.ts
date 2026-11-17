/**
 * 폴링 직행(② B17 · ③ 11-1) — 함수 호출 월 한도 때문에 30초 폴링은 **함수가 아니라 PostgREST 직행**(RLS)으로 「바뀌었나」만 읽는다.
 *   보결: `sub_slot` 에서 `project_id=…` 최신 `updated_at` 하나(`order=updated_at.desc&limit=1` — PostgREST `max()` 집계는 기본 꺼짐)
 *   조각: `parts` 에서 `part, version` — 판이 바뀐 조각 이름만 넘긴다.
 *   바뀜 없으면 콜백(=함수 호출) 0회. 401 이면 멈춘다(다시 로그인 몫) · 네트워크·503 은 다음 바퀴에 다시.
 *   클라이언트·타이머는 주입식 — 시험에서 가짜 supabase 로 돈다.
 */
import type { Failure, PollHandle, PollOptions } from './contracts/server-link';
import { classifyFailure } from './errors';

export const POLL_INTERVAL_MS = 30_000;

interface QueryResult { data: unknown; error: unknown; status?: number }
/** supabase-js 쿼리 빌더에서 쓰는 만큼만 — eq·order·limit 를 이어 붙이고 await 하면 결과. */
export interface PollQuery extends PromiseLike<QueryResult> {
    eq(col: string, val: string): PollQuery;
    order(col: string, opts: { ascending: boolean }): PollQuery;
    limit(n: number): PollQuery;
}
export interface PollClient {
    from(table: string): { select(cols: string): PollQuery };
}

export interface PollerDeps {
    client: PollClient;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (h: unknown) => void;
}

export interface Poller extends PollHandle {
    /** 한 바퀴(시험·「지금 새로 고침」용). */
    tick(): Promise<void>;
}

export function createPoller(opts: PollOptions, deps: PollerDeps): Poller {
    const { client } = deps;
    const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    const interval = opts.intervalMs ?? POLL_INTERVAL_MS;

    let subSeen = !!opts.known && 'subUpdatedAt' in opts.known;
    let subAt: string | null = opts.known?.subUpdatedAt ?? null;
    let partsSeen = !!opts.known?.parts;
    let versions: Record<string, number> = { ...(opts.known?.parts ?? {}) };
    let running = true;
    let timer: unknown = null;

    const fail = (f: Failure) => {
        opts.onFailure?.(f);
        if (f.kind === 'unauthorized') stop();
    };

    async function readSub(): Promise<boolean> {
        const r = await client.from('sub_slot').select('updated_at')
            .eq('project_id', opts.projectId).order('updated_at', { ascending: false }).limit(1);
        if (r.error) { fail(classifyFailure(r)); return false; }
        const rows = (r.data as { updated_at?: string }[] | null) ?? [];
        const at = rows[0]?.updated_at ?? null;
        const changed = subSeen && at !== subAt;
        subSeen = true;
        subAt = at;
        if (changed && running) await opts.onSubChanged?.(at);
        return true;
    }

    async function readParts(): Promise<boolean> {
        const r = await client.from('parts').select('part, version').eq('project_id', opts.projectId);
        if (r.error) { fail(classifyFailure(r)); return false; }
        const rows = (r.data as { part: string; version: number }[] | null) ?? [];
        const next: Record<string, number> = {};
        for (const row of rows) next[row.part] = row.version;
        const changed = partsSeen ? Object.keys(next).filter((p) => versions[p] !== next[p]) : [];
        partsSeen = true;
        versions = next;
        if (changed.length && running) await opts.onPartsChanged?.(changed);
        return true;
    }

    async function tick(): Promise<void> {
        if (!running) return;
        try {
            if (opts.onSubChanged) { if (!(await readSub())) return; }
            if (opts.onPartsChanged && running) await readParts();
        } catch (e) {
            fail(classifyFailure(e));
        }
    }

    function schedule() {
        if (!running) return;
        timer = setTimer(() => { void tick().finally(schedule); }, interval);
    }

    function stop() {
        running = false;
        if (timer !== null) { clearTimer(timer); timer = null; }
    }

    schedule();
    return {
        tick,
        stop,
        get running() { return running; },
    };
}
