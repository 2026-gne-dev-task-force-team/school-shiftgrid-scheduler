/**
 * 🔴 약속 「server-link」 0.1.0 — 앱이 Supabase 서버와 말하는 통로의 타입(값 0) · 1.2v 설계 ③ F1 · ② B17.
 *   소비자(로그인 판·보결 목록 등)는 host.modules.use<ServerLink>('server-link') 로 받는다.
 *   🔴 supabase-js `createClient(` 는 server-link 안에서만 — 소비자는 client() 로 빌려 쓴다.
 */

/** site.config.json 의 서버 칸 — 둘 중 하나라도 비면 「서버 미설정」(앱은 로컬로 돈다). */
export interface ServerConfig {
    supabaseUrl?: string;
    anonKey?: string;
}

/**
 * 연결 상태.
 *   unconfigured: 설정이 비어 서버를 안 쓴다(조용히 — 경고·오류 없음)
 *   loading: 클라이언트를 만드는 중(supabase-js 를 늦게 불러온다)
 *   signed-out / signed-in: onAuthStateChange 가 알려 준 세션 유무
 */
export type LinkStatus = 'unconfigured' | 'loading' | 'signed-out' | 'signed-in';

/**
 * 끊김 갈래(③ F1 「끊김 구분」).
 *   network: 응답 자체가 없다(오프라인·DNS·CORS) — 기다렸다 다시
 *   unauthorized: 401 — 다시 로그인해야 한다(재시도 멈춤)
 *   sleeping: 503 — 서버가 잠들었거나 복원 중(Supabase 무료 판 일시정지) — 오래 기다렸다 다시
 *   server: 그 밖의 HTTP 오류(4xx·5xx) — 함수 오류 꼴 `{error:{code,message}}` 의 code 를 싣는다
 */
export type FailureKind = 'network' | 'unauthorized' | 'sleeping' | 'server';
export interface Failure {
    kind: FailureKind;
    status?: number;
    code?: string;
    message?: string;
}

/** 직행 폴링 설정(② B17) — 30초마다 바뀜만 직접 읽고, 바뀌었을 때만 함수를 부른다. */
export interface PollOptions {
    projectId: string;
    intervalMs?: number;
    /** sub_slot 최신 updated_at 이 바뀌었을 때만 — 여기서 함수 `sub/list` 를 부른다. */
    onSubChanged?: (updatedAt: string | null) => void | Promise<void>;
    /** 판(version)이 바뀐 조각 이름만 — 여기서 그 조각만 함수 `parts` GET. */
    onPartsChanged?: (parts: string[]) => void | Promise<void>;
    onFailure?: (f: Failure) => void;
    /** 이미 들고 있는 판 — 주면 첫 바퀴부터 비교한다(안 주면 첫 바퀴는 기준만 잡는다). */
    known?: { subUpdatedAt?: string | null; parts?: Record<string, number> };
}

export interface PollHandle {
    stop(): void;
    readonly running: boolean;
}

export interface ServerLink {
    version: 1;
    status(): LinkStatus;
    /** supabase-js 클라이언트 — 미설정·준비 전이면 null. */
    client(): unknown;
    onChange(fn: (s: LinkStatus) => void): { dispose(): void };
    /** 미설정·로그아웃이면 null(폴링 안 함). 로그아웃되면 저절로 멈춘다. */
    startPolling(opts: PollOptions): PollHandle | null;
    classify(e: unknown): Failure;
}
