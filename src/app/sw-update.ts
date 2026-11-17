/**
 * 새 판 안내 — 서비스워커 업데이트 감지(T-10fp).
 *
 * 🔴 왜: 배포 뒤에도 서비스워커가 캐시한 옛 번들(main-*.js)을 돌려 이미 고친 오류가 다시 보였다.
 *    옛 장치(registerType autoUpdate)는 새 워커가 깔려도 열린 탭에 아무 말이 없고, 다음 방문까지 옛 화면이 남는다.
 * ⭐ 지금: 새 워커가 「대기」에 들어오면 알림(새 버전이 있습니다 · 새로 고침)을 띄우고, 선생님이 누르면
 *    대기 워커에 SKIP_WAITING 메시지를 보낸 뒤 새 워커가 쥐는 순간 새로고침한다.
 * ⛔ 자동 강제 새로고침은 하지 않는다 — 편집 중인 자료를 잃지 않게 누를 때만.
 * 순수 함수로 떼어 둔다 — 브라우저 객체는 전부 인자로 받는다(시험은 가짜로).
 */

/** 서비스워커 등록의 필요한 모양만 */
export interface SwWorkerLike {
    state: string;
    postMessage(msg: unknown): void;
    addEventListener(type: 'statechange', fn: () => void): void;
}
export interface SwRegistrationLike {
    waiting: SwWorkerLike | null;
    installing: SwWorkerLike | null;
    addEventListener(type: 'updatefound', fn: () => void): void;
    update(): Promise<unknown>;
}
export interface SwContainerLike {
    controller: unknown;
    addEventListener(type: 'controllerchange', fn: () => void): void;
}

export const SW_SKIP_WAITING = { type: 'SKIP_WAITING' } as const;

/**
 * 새 워커가 「대기」에 들어오면 onWaiting 을 부른다(한 번만).
 * 이미 대기 중이면 곧바로. 첫 설치(controller 없음)는 새 판이 아니라 안내하지 않는다.
 */
export function watchWaitingWorker(reg: SwRegistrationLike, container: SwContainerLike, onWaiting: (w: SwWorkerLike) => void): void {
    let fired = false;
    const fire = (w: SwWorkerLike) => { if (fired) return; fired = true; onWaiting(w); };
    if (reg.waiting && container.controller) fire(reg.waiting);
    reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
            if (w.state === 'installed' && container.controller) fire(reg.waiting ?? w);
        });
    });
}

/** 누르면 — 대기 워커에 skipWaiting 메시지를 보내고, 새 워커가 쥐면(controllerchange) 한 번 새로고침한다. */
export function applyWaitingWorker(w: SwWorkerLike, container: SwContainerLike, reload: () => void): void {
    let done = false;
    container.addEventListener('controllerchange', () => { if (done) return; done = true; reload(); });
    w.postMessage(SW_SKIP_WAITING);
}

export const SW_UPDATE_COMMAND = 'frame.app.update';
export const SW_UPDATE_NOTICE = {
    level: 'info' as const,
    title: '새 버전이 있습니다',
    body: '지금 하던 일을 마친 뒤 눌러 주세요. 누르면 새로 고칩니다.',
    key: 'sw-update',
    timeout: 0,
    action: { label: '새로 고침', commandId: SW_UPDATE_COMMAND },
};

/** 환경 한 벌 — 실제는 navigator.serviceWorker · location.reload · notify */
export interface SwUpdateEnv {
    container: SwContainerLike & { register(url: string): Promise<SwRegistrationLike> };
    swUrl: string;
    notify(n: typeof SW_UPDATE_NOTICE): void;
    reload(): void;
    /** 열린 탭에서 업데이트를 찾는 주기(ms) · 0 이면 안 찾는다 */
    pollMs?: number;
    onVisible?(fn: () => void): void;
}

/** 등록 + 감지. 돌려주는 apply 는 안내 단추 명령이 부른다(대기 워커가 없으면 아무 일 없음). */
export async function startSwUpdate(env: SwUpdateEnv): Promise<{ apply: () => void }> {
    let waiting: SwWorkerLike | null = null;
    const reg = await env.container.register(env.swUrl);
    watchWaitingWorker(reg, env.container, (w) => { waiting = w; env.notify(SW_UPDATE_NOTICE); });
    const check = () => { void reg.update().catch(() => { /* 오프라인 — 조용히 */ }); };
    env.onVisible?.(check);
    if (env.pollMs) setInterval(check, env.pollMs);
    check();
    return { apply: () => { if (waiting) applyWaitingWorker(waiting, env.container, env.reload); } };
}
