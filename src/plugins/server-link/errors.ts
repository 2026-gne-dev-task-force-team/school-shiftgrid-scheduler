/**
 * 끊김 구분(③ F1) — 무엇이 와도 네 갈래(network·unauthorized·sleeping·server) 중 하나로 접는다. 순수 함수.
 *   서버 함수 오류 꼴은 `{error:{code, message}}`(supabase/functions/_shared/errors.ts) — 몸이 이미 풀려 있으면 code 를 싣는다.
 *   받는 것: 던져진 오류(TypeError 'Failed to fetch' · supabase-js FunctionsFetchError/FunctionsHttpError) ·
 *            PostgREST 결과 `{error, status}` · Response 꼴 `{status}`.
 */
import type { Failure } from './contracts/server-link';

/** 서버가 잠들었거나 복원 중일 때 오는 상태 번호. */
export const SLEEPING_STATUS = 503;

const NETWORK_NAMES = new Set(['TypeError', 'FunctionsFetchError', 'AuthRetryableFetchError', 'AbortError']);
const NETWORK_TEXT = /failed to fetch|networkerror|network request failed|load failed|fetch failed/i;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null;

function statusOf(e: Rec): number | undefined {
    if (typeof e.status === 'number') return e.status;
    // FunctionsHttpError.context = Response
    if (isRec(e.context) && typeof e.context.status === 'number') return e.context.status;
    if (isRec(e.error) && typeof e.error.status === 'number') return e.error.status;
    return undefined;
}

/** 함수 오류 몸 `{error:{code,message}}` 또는 PostgREST 오류 `{error:{code,message}}` 에서 code·message. */
function bodyOf(e: Rec): { code?: string; message?: string } {
    const inner = isRec(e.error) ? e.error : isRec(e.body) && isRec(e.body.error) ? e.body.error : undefined;
    const pick = inner ?? e;
    return {
        code: typeof pick.code === 'string' && pick.code ? pick.code : undefined,
        message: typeof pick.message === 'string' ? pick.message : undefined,
    };
}

export function classifyFailure(e: unknown): Failure {
    if (!isRec(e)) return { kind: 'network', message: typeof e === 'string' ? e : undefined };
    const status = statusOf(e);
    const { code, message } = bodyOf(e);
    if (status === 401) return { kind: 'unauthorized', status, code, message };
    if (status === SLEEPING_STATUS) return { kind: 'sleeping', status, code, message };
    // 응답이 아예 없었다(status 0·없음) — TypeError 'Failed to fetch' · FunctionsFetchError · PostgREST status 0
    if (!status) return { kind: 'network', message };
    // status 가 있어도 몸이 네트워크 실패 꼴이면(일부 래퍼가 0 대신 다른 값을 싣는 경우) 네트워크로
    const name = typeof e.name === 'string' ? e.name : '';
    if (NETWORK_NAMES.has(name) && NETWORK_TEXT.test(message ?? '')) return { kind: 'network', status, message };
    return { kind: 'server', status, code, message };
}
