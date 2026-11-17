/**
 * 솔버 Worker — 브라우저에서 solve() 가 이 Worker 로 무거운 계산을 넘긴다.
 * 진행 상황은 postMessage 로 흘려보낸다. node·테스트에서는 쓰이지 않는다(같은 스레드로 돈다).
 */
import type { Doc } from '../types/doc';
import type { SolveOptions } from './api';
import { solveSync } from './solver';

// Web Worker 전역. DOM lib 의 self 타입과 부딪히지 않게 any 로 받는다.
const ctx = self as unknown as {
    onmessage: ((e: MessageEvent) => void) | null;
    postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e: MessageEvent) => {
    const { doc, opts } = e.data as { doc: Doc; opts: SolveOptions };
    try {
        const result = solveSync(doc, opts, (progress) => ctx.postMessage({ type: 'progress', progress }));
        ctx.postMessage({ type: 'result', result });
    } catch (err) {
        ctx.postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) });
    }
};
