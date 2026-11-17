/**
 * 비밀번호 판 본체(③ F4 · 10-5) — 비번 변경 · 재설정 메일 보내기. 순수 상태 + 주입받은 클라이언트.
 *   🔴 네트워크는 server-link 몫 — server-link 가 만든 클라이언트를 빌려 supabase-js Auth 메서드만 부른다.
 *      ⛔ `createClient(`·`fetch(` 를 이 폴더에서 직접 부르지 않는다.
 *   🔴 프레임 거부(③ 6절 2번) — 남의 창(iframe) 안에서 열렸으면(`top !== self`) 아무것도 부르지 않는다. 화면도 입력칸을 안 그린다.
 *   변경: `updateUser({password})` → 이어서 `signOut({scope:'others'})` — 지금 기기 빼고 다 끊는다(10-5).
 *   재설정 메일: `resetPasswordForEmail(email, {redirectTo})` — 링크가 돌아오면 recovery.ts 가 착지를 맡는다(F6).
 *   비밀번호는 이 모듈 밖으로 안 나간다(반환·기록 0).
 */
import type { Failure } from '../../server-link/contracts/server-link';
import { MIN_PASSWORD } from '../session';

/** supabase-js 클라이언트에서 비밀번호 판이 쓰는 만큼만(가짜로 갈아 끼울 수 있게). */
export interface PasswordClient {
    auth: {
        signInWithPassword(c: { email: string; password: string }): Promise<{ data: unknown; error: unknown }>;
        updateUser(a: { password: string }): Promise<{ data: unknown; error: unknown }>;
        signOut(o?: { scope?: 'global' | 'local' | 'others' }): Promise<{ error: unknown }>;
        resetPasswordForEmail(email: string, o?: { redirectTo?: string }): Promise<{ data: unknown; error: unknown }>;
        onAuthStateChange(cb: (event: string, session: unknown) => void): { data: { subscription: { unsubscribe(): void } } };
    };
}

/**
 * 실패 갈래 — 화면이 이것으로 문구를 고른다.
 *   framed: 남의 창 안 · unconfigured: 서버 미설정 · signed-out: 로그인 안 함(변경) · short·mismatch·same: 새 비번 검사
 *   wrong-password: 지금 비번 틀림 · bad-email: 이메일 꼴 아님 · rate-limited: 메일·요청이 너무 잦음
 *   not-recovery: 재설정 링크로 온 세션이 아님 · link-used: 이 링크로 이미 바꿨음(한 번만)
 *   network·sleeping·server: 끊김(server-link 갈래)
 */
export type PasswordFailReason =
    | 'framed' | 'unconfigured' | 'signed-out' | 'short' | 'mismatch' | 'same'
    | 'wrong-password' | 'bad-email' | 'rate-limited' | 'not-recovery' | 'link-used'
    | 'network' | 'sleeping' | 'server';
export type PasswordResult = { ok: true } | { ok: false; reason: PasswordFailReason; message: string };

export const PASSWORD_MESSAGES: Record<PasswordFailReason, string> = {
    'framed': '이 화면은 다른 누리집 안에서는 열 수 없습니다. 앱 주소를 주소창에 직접 넣어 여세요.',
    'unconfigured': '서버에 아직 연결되지 않았습니다. 잠시 뒤 다시 해 보세요.',
    'signed-out': '로그인한 뒤에 비밀번호를 바꿀 수 있습니다.',
    'short': `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`,
    'mismatch': '새 비밀번호 두 칸이 서로 다릅니다.',
    'same': '지금 비밀번호와 다른 비밀번호를 넣어 주세요.',
    'wrong-password': '지금 비밀번호가 맞지 않습니다.',
    'bad-email': '이메일 꼴이 아닙니다.',
    'rate-limited': '요청이 너무 잦습니다. 1분쯤 뒤 다시 해 보세요.',
    'not-recovery': '재설정 메일의 링크로 들어온 것이 아닙니다. 재설정 메일을 다시 보내세요.',
    'link-used': '이 재설정 링크로는 이미 비밀번호를 바꿨습니다. 다시 바꾸려면 재설정 메일을 새로 보내세요.',
    'network': '인터넷 연결을 확인해 주세요.',
    'sleeping': '서버가 깨어나는 중입니다. 1~2분 뒤 다시 해 보세요.',
    'server': '서버에서 처리하지 못했습니다. 잠시 뒤 다시 해 보세요.',
};

export const pwFail = (reason: PasswordFailReason): PasswordResult => ({ ok: false, reason, message: PASSWORD_MESSAGES[reason] });

/** 남의 창(iframe) 안인가 — 다른 출처 부모면 top 읽기가 던지므로 그때도 「안」으로 본다. */
export function isFramed(w: { top: unknown; self: unknown } | undefined = typeof window !== 'undefined' ? window : undefined): boolean {
    if (!w) return false;
    try { return w.top !== w.self; } catch { return true; }
}

/** 새 비밀번호 검사(서버에 가기 전) — 8자 · 두 칸 같음. 통과면 null. */
export function checkNewPassword(next: string, confirm: string): PasswordFailReason | null {
    if (next.length < MIN_PASSWORD) return 'short';
    if (next !== confirm) return 'mismatch';
    return null;
}

/** Auth 오류 → 갈래. 같은 비번(422 same_password) · 약한 비번(weak_password) · 429 · 끊김. */
export function authReason(e: unknown, classify: (e: unknown) => Failure): PasswordFailReason {
    const f = classify(e);
    if (f.kind === 'network' || f.kind === 'sleeping') return f.kind;
    if (f.kind === 'unauthorized') return 'signed-out';
    if (f.code === 'same_password') return 'same';
    if (f.code === 'weak_password') return 'short';
    if (f.status === 429 || /rate.?limit/i.test(f.code ?? '')) return 'rate-limited';
    return 'server';
}

export interface PasswordOpsDeps {
    getClient(): PasswordClient | null;
    classify(e: unknown): Failure;
    /** 지금 로그인한 사람의 이메일 — 손님이면 null. */
    currentEmail(): string | null;
    /** 재설정 링크가 돌아올 주소(대시보드 Redirect URLs 에 있어야 한다) — 없으면 Site URL. */
    redirectTo?(): string | undefined;
    isFramed?(): boolean;
}

export interface PasswordOps {
    /** 지금 비번을 확인하고 새 비번으로 바꾼 뒤 다른 기기를 끊는다. */
    changePassword(current: string, next: string, confirm: string): Promise<PasswordResult>;
    /** 재설정 메일 — 가입 안 된 주소라도 성공으로 답한다(누가 가입했는지 새지 않게 · Auth 동작 그대로). */
    sendResetMail(email: string): Promise<PasswordResult>;
}

export function createPasswordOps(deps: PasswordOpsDeps): PasswordOps {
    const framed = () => (deps.isFramed ?? isFramed)();
    const reason = (e: unknown) => authReason(e, deps.classify);

    async function changePassword(current: string, next: string, confirm: string): Promise<PasswordResult> {
        if (framed()) return pwFail('framed');
        const c = deps.getClient();
        if (!c) return pwFail('unconfigured');
        const email = deps.currentEmail();
        if (!email) return pwFail('signed-out');
        const bad = checkNewPassword(next, confirm);
        if (bad) return pwFail(bad);
        if (next === current) return pwFail('same');
        try {
            // 자리를 비운 사이 남이 바꾸지 못하게 지금 비번부터 확인한다(공용 PC).
            const who = await c.auth.signInWithPassword({ email, password: current });
            if (who.error) {
                const r = reason(who.error);
                return pwFail(r === 'server' || r === 'signed-out' ? 'wrong-password' : r);
            }
            const up = await c.auth.updateUser({ password: next });
            if (up.error) return pwFail(reason(up.error));
        } catch (e) {
            return pwFail(reason(e));
        }
        // 다른 기기 끊기 — 실패해도 비번은 이미 바뀌었다(다른 기기 토큰은 15분 안에 갱신에서 막힌다).
        try { await c.auth.signOut({ scope: 'others' }); } catch { /* 조용히 */ }
        return { ok: true };
    }

    async function sendResetMail(email: string): Promise<PasswordResult> {
        if (framed()) return pwFail('framed');
        const c = deps.getClient();
        if (!c) return pwFail('unconfigured');
        const mail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return pwFail('bad-email');
        try {
            const to = deps.redirectTo?.();
            const { error } = await c.auth.resetPasswordForEmail(mail, to ? { redirectTo: to } : undefined);
            if (error) return pwFail(reason(error));
        } catch (e) {
            return pwFail(reason(e));
        }
        return { ok: true };
    }

    return { changePassword, sendResetMail };
}
