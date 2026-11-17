/**
 * 편성 돌리기 — 엔진(solveSync)을 Web Worker 로 돌리고 진행을 알리며 멈출 수 있게 한다.
 *   worker 는 engine/worker.ts 그대로(메시지 꼴 progress·result·error) — 엔진 알고리즘은 안 건드린다.
 *   시험은 가짜 worker(WorkerFactory)를 꽂는다. Worker 가 없는 곳(시험·옛 브라우저)은 엔진 solve 가 같은 스레드로 돈다(멈춤은 결과를 버리는 것뿐).
 */
import type { SolveOptions, SolveProgress, SolveResult } from './engine/api';
import type { SolverInput } from './contracts/solver';
import { solve } from './engine/solver';

/** 브라우저 Worker 중 쓰는 부분만. */
export interface WorkerLike {
    onmessage: ((e: { data: unknown }) => void) | null;
    onerror: ((e: unknown) => void) | null;
    postMessage(msg: unknown): void;
    terminate(): void;
}
export type WorkerFactory = () => WorkerLike;

export const realWorker: WorkerFactory = () =>
    new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

/** 멈춤 단추로 끝낸 것 — 오류가 아니다. */
export class SolveStopped extends Error {
    constructor() { super('편성을 멈췄습니다'); this.name = 'SolveStopped'; }
}

export interface SolveJob { done: Promise<SolveResult>; stop(): void }

export function startSolve(
    input: SolverInput, opts: SolveOptions, onProgress: (p: SolveProgress) => void,
    factory: WorkerFactory | null = typeof Worker !== 'undefined' ? realWorker : null,
): SolveJob {
    if (!factory) {
        let stopped = false;
        const done = solve(input, opts, (p) => { if (!stopped) onProgress(p); })
            .then((r) => { if (stopped) throw new SolveStopped(); return r; });
        return { done, stop: () => { stopped = true; } };
    }
    const worker = factory();
    let settle: { resolve(r: SolveResult): void; reject(e: Error): void } | null = null;
    const done = new Promise<SolveResult>((resolve, reject) => { settle = { resolve, reject }; });
    const end = () => { try { worker.terminate(); } catch { /* 이미 끝남 */ } };
    worker.onmessage = (e) => {
        const msg = e.data as { type?: string; progress?: SolveProgress; result?: SolveResult; error?: string } | null;
        if (msg?.type === 'progress' && msg.progress) onProgress(msg.progress);
        else if (msg?.type === 'result' && msg.result) { settle?.resolve(msg.result); end(); }
        else if (msg?.type === 'error') { settle?.reject(new Error(msg.error ?? '편성 중 오류')); end(); }
    };
    worker.onerror = (e) => { settle?.reject(e instanceof Error ? e : new Error('편성 worker 오류')); end(); };
    worker.postMessage({ doc: input, opts });
    return { done, stop: () => { end(); settle?.reject(new SolveStopped()); } };
}
