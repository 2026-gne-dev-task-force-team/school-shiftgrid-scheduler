/**
 * server-link 통로 본체(③ F1) — supabase-js 클라이언트 생성 · 세션 상태 구독 · 폴링 손잡이.
 *   🔴 `createClient(` 는 앱 전체에서 여기 한 곳(③ 「네트워크는 server-link 만」). supabase-js 는 설정이 있을 때만
 *      늦게 불러온다(dynamic import) — 미설정 판은 번들을 안 받는다.
 *   설정(supabaseUrl·anonKey)이 비면 「unconfigured」로 조용히 선다 — 오류·경고 없음, 앱은 로컬로 돈다.
 *   로그아웃(세션 없음)이 오면 돌던 폴링을 전부 멈춘다 · dispose() 는 인증 구독까지 푼다.
 */
import type { LinkStatus, PollOptions, PollHandle, ServerConfig, ServerLink } from './contracts/server-link';
import { classifyFailure } from './errors';
import { createPoller, type PollClient, type PollerDeps } from './poll';

interface AuthSub { unsubscribe(): void }
/** supabase-js 클라이언트에서 쓰는 만큼만. */
export interface LinkClient extends PollClient {
    auth: {
        onAuthStateChange(cb: (event: string, session: unknown) => void): { data: { subscription: AuthSub } };
    };
}

export type MakeClient = (url: string, key: string) => Promise<LinkClient>;

/** 진짜 생성기 — supabase-js 를 이때 처음 불러온다. */
export const supabaseClientMaker: MakeClient = async (url, key) => {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, key) as unknown as LinkClient;
};

export function isConfigured(c: ServerConfig | undefined): c is Required<ServerConfig> {
    return !!c && typeof c.supabaseUrl === 'string' && c.supabaseUrl.trim() !== ''
        && typeof c.anonKey === 'string' && c.anonKey.trim() !== '';
}

export interface LinkDeps {
    makeClient?: MakeClient;
    setTimer?: PollerDeps['setTimer'];
    clearTimer?: PollerDeps['clearTimer'];
}

export interface ServerLinkRuntime extends ServerLink {
    /** 클라이언트를 만들고 세션 구독을 건다(미설정이면 아무것도 안 함). 두 번 불러도 한 번. */
    start(): Promise<void>;
    dispose(): void;
}

export function createServerLink(config: ServerConfig | undefined, deps: LinkDeps = {}): ServerLinkRuntime {
    const makeClient = deps.makeClient ?? supabaseClientMaker;
    let state: LinkStatus = isConfigured(config) ? 'loading' : 'unconfigured';
    let client: LinkClient | null = null;
    let authSub: AuthSub | null = null;
    let started: Promise<void> | null = null;
    let disposed = false;
    const listeners = new Set<(s: LinkStatus) => void>();
    const polls = new Set<PollHandle>();

    const set = (s: LinkStatus) => {
        if (s === state) return;
        state = s;
        if (s !== 'signed-in') stopPolls();
        for (const fn of [...listeners]) fn(s);
    };

    function stopPolls() {
        for (const p of polls) p.stop();
        polls.clear();
    }

    async function boot(): Promise<void> {
        if (!isConfigured(config)) return;
        const c = await makeClient(config.supabaseUrl.trim(), config.anonKey.trim());
        if (disposed) return;
        client = c;
        // 첫 알림(INITIAL_SESSION)이 세션 유무를 알려 준다 — 그 전까지는 로그아웃으로 본다.
        set('signed-out');
        const { data } = c.auth.onAuthStateChange((event, session) => {
            if (disposed) return;
            set(event === 'SIGNED_OUT' || !session ? 'signed-out' : 'signed-in');
        });
        authSub = data.subscription;
    }

    return {
        version: 1,
        status: () => state,
        client: () => client,
        onChange(fn) {
            listeners.add(fn);
            return { dispose: () => { listeners.delete(fn); } };
        },
        startPolling(opts: PollOptions) {
            if (!client || state !== 'signed-in' || disposed) return null;
            const p = createPoller(opts, { client, setTimer: deps.setTimer, clearTimer: deps.clearTimer });
            polls.add(p);
            return p;
        },
        classify: classifyFailure,
        start() {
            if (!started) started = boot();
            return started;
        },
        dispose() {
            disposed = true;
            stopPolls();
            authSub?.unsubscribe();
            authSub = null;
            listeners.clear();
        },
    };
}
