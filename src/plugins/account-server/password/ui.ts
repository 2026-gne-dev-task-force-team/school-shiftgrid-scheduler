/** 명령 → 비밀번호 창 사이 작은 다리(어느 창을 열지) — 상태만, 화면 0. */
export type PasswordView = 'none' | 'change' | 'reset';

export function createPasswordUi() {
    let view: PasswordView = 'none';
    const listeners = new Set<() => void>();
    const set = (v: PasswordView) => { view = v; for (const fn of [...listeners]) fn(); };
    return {
        view: () => view,
        open: (v: Exclude<PasswordView, 'none'>) => set(v),
        close: () => set('none'),
        onChange(fn: () => void) { listeners.add(fn); return { dispose: () => { listeners.delete(fn); } }; },
    };
}
export type PasswordUi = ReturnType<typeof createPasswordUi>;
