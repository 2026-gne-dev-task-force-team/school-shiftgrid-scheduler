/**
 * 재설정 메일 링크 착지(③ F6 · 10-5) — 링크가 Site URL 로 돌아오면 새 비밀번호 판을 연다.
 *   흐름: ① 앱이 뜰 때(클라이언트가 주소를 먹기 전) 주소의 `type=recovery`·`error_code` 를 읽어 둔다(capture)
 *         ② supabase-js 가 주소의 토큰으로 세션을 세우고 `PASSWORD_RECOVERY` 사건을 낸다(attach 가 받는다)
 *            — 사건을 놓쳐도 ①에서 recovery 를 봤고 세션이 서면(signed-in) 같은 판으로 간다(linkChanged)
 *         ③ 세션이 선 뒤 주소창에서 토큰 조각(#access_token=… · ?code=…)을 지운다(history.replaceState — 새로고침·뒤로가기에 안 남게)
 *         ④ 새 비번 8자 · 두 칸 같음 → `updateUser({password})` → 다른 기기 끊기 → 「끝남」.
 *   🔴 링크는 한 번만 — 끝난 뒤 다시 내면 link-used(서버도 같은 링크 재사용을 otp_expired 로 거부 → link-error 로 착지).
 *   🔴 프레임 거부 — 남의 창 안이면 updateUser 를 부르지 않는다.
 *   ⛔ `createClient(`·`fetch(` — 클라이언트는 server-link 것을 빌린다.
 */
import type { Failure, LinkStatus } from '../../server-link/contracts/server-link';
import { authReason, checkNewPassword, isFramed, pwFail, type PasswordClient, type PasswordResult } from './password';

export interface LocationLike { pathname: string; search: string; hash: string }
export interface HistoryLike { state: unknown; replaceState(data: unknown, unused: string, url?: string): void }

/** 주소에서 지울 인증 조각 — 암시 흐름(#…)·PKCE(?code=…)·오류 조각 모두. */
const AUTH_KEYS = [
    'access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'type',
    'provider_token', 'provider_refresh_token', 'code', 'token_hash',
    'error', 'error_code', 'error_description',
];

export type Landing =
    | { kind: 'none' }
    | { kind: 'recovery' }
    /** 링크가 낡았거나 이미 쓰였다(otp_expired 등) — 세션이 안 선다. */
    | { kind: 'link-error'; code: string };

const params = (s: string) => new URLSearchParams(s.replace(/^[#?]/, ''));

/** 주소만 보고 재설정 착지인가를 가른다(순수). */
export function readLanding(loc: LocationLike): Landing {
    const h = params(loc.hash);
    const q = params(loc.search);
    const get = (k: string) => h.get(k) ?? q.get(k);
    const err = get('error_code') ?? get('error');
    if (err) return { kind: 'link-error', code: err };
    if (get('type') === 'recovery') return { kind: 'recovery' };
    return { kind: 'none' };
}

/** 주소창에서 인증 조각만 지운다(다른 조각·경로는 그대로). 바꿨으면 true. */
export function scrubLanding(loc: LocationLike, hist: HistoryLike): boolean {
    // 조각을 & 로 나눠 인증 열쇠만 뺀다 — 남은 조각은 글자 그대로(#board 가 #board= 로 바뀌지 않게).
    const strip = (s: string): string => {
        if (s.length < 2) return s;
        const parts = s.slice(1).split('&');
        const keep = parts.filter((seg) => !AUTH_KEYS.includes(decodeURIComponent(seg.split('=')[0] ?? '')));
        if (keep.length === parts.length) return s;
        return keep.length ? `${s[0]}${keep.join('&')}` : '';
    };
    const search = strip(loc.search);
    const hash = strip(loc.hash);
    if (search === loc.search && hash === loc.hash) return false;
    hist.replaceState(hist.state, '', `${loc.pathname}${search}${hash}`);
    return true;
}

/**
 * 착지 상태.
 *   idle: 착지 아님 · waiting: 주소로는 착지인데 세션이 아직 · ready: 새 비번 입력 판
 *   done: 바꿨음(이 링크는 끝) · link-error: 링크가 낡음·쓰임·세션 안 섬
 */
export type RecoveryState = 'idle' | 'waiting' | 'ready' | 'done' | 'link-error';

export interface RecoveryDeps {
    getClient(): PasswordClient | null;
    classify(e: unknown): Failure;
    location?(): LocationLike | undefined;
    history?(): HistoryLike | undefined;
    isFramed?(): boolean;
}

export interface Recovery {
    state(): RecoveryState;
    /** link-error 때 서버가 준 오류 이름(otp_expired 등). */
    errorCode(): string | null;
    onChange(fn: () => void): { dispose(): void };
    /** 앱이 뜰 때 한 번 — 클라이언트가 주소를 먹기 전에 부른다. */
    capture(): void;
    /** 빌린 클라이언트의 인증 사건을 듣는다 — PASSWORD_RECOVERY 면 ready. */
    attach(c: PasswordClient): { dispose(): void };
    /** server-link 상태가 바뀌었을 때 — loading 이 끝나면 주소를 닦고, 착지 대기 중이면 판을 정한다. */
    linkChanged(s: LinkStatus): void;
    /** 새 비번으로 바꾼다 — ready 에서만 · 한 번만. */
    submit(next: string, confirm: string): Promise<PasswordResult>;
    /** 판을 닫는다(끝남·오류를 본 뒤). */
    dismiss(): void;
}

export function createRecovery(deps: RecoveryDeps): Recovery {
    let state: RecoveryState = 'idle';
    let code: string | null = null;
    let pending = false;
    let dirty = false;       // 주소에 인증 조각이 남아 있다(닦을 차례를 기다림)
    const listeners = new Set<() => void>();
    const loc = () => deps.location?.() ?? (typeof window !== 'undefined' ? window.location : undefined);
    const hist = () => deps.history?.() ?? (typeof window !== 'undefined' ? window.history : undefined);
    const framed = () => (deps.isFramed ?? isFramed)();

    const set = (s: RecoveryState) => {
        if (s === state) return;
        state = s;
        for (const fn of [...listeners]) fn();
    };
    const scrub = () => {
        const l = loc(); const h = hist();
        if (l && h) scrubLanding(l, h);
        dirty = false;
    };

    return {
        state: () => state,
        errorCode: () => code,
        onChange(fn) {
            listeners.add(fn);
            return { dispose: () => { listeners.delete(fn); } };
        },
        capture() {
            const l = loc();
            if (!l) return;
            const land = readLanding(l);
            if (land.kind === 'link-error') {
                // 세션이 안 서는 링크 — supabase-js 가 먹을 것도 없으니 바로 닦는다.
                code = land.code;
                scrub();
                set('link-error');
            } else if (land.kind === 'recovery') {
                dirty = true;
                set('waiting');
            }
        },
        attach(c) {
            const { data } = c.auth.onAuthStateChange((event) => {
                if (event !== 'PASSWORD_RECOVERY' || state === 'done') return;
                scrub();
                set('ready');
            });
            return { dispose: () => data.subscription.unsubscribe() };
        },
        linkChanged(s) {
            if (s === 'loading' || s === 'unconfigured') return;
            // 클라이언트가 섰다 = 주소의 토큰은 이미 먹혔다 — 이제 닦는다.
            if (dirty) scrub();
            if (state !== 'waiting') return;
            if (s === 'signed-in') set('ready');
            else { code = 'no-session'; set('link-error'); }
        },
        async submit(next, confirm) {
            if (framed()) return pwFail('framed');
            if (state === 'done') return pwFail('link-used');
            if (state !== 'ready') return pwFail('not-recovery');
            const bad = checkNewPassword(next, confirm);
            if (bad) return pwFail(bad);
            if (pending) return pwFail('link-used');
            const c = deps.getClient();
            if (!c) return pwFail('unconfigured');
            pending = true;
            try {
                const { error } = await c.auth.updateUser({ password: next });
                if (error) return pwFail(authReason(error, deps.classify));
            } catch (e) {
                return pwFail(authReason(e, deps.classify));
            } finally {
                pending = false;
            }
            set('done');
            try { await c.auth.signOut({ scope: 'others' }); } catch { /* 조용히 */ }
            return { ok: true };
        },
        dismiss() {
            if (state === 'waiting') return;
            code = null;
            set('idle');
        },
    };
}
