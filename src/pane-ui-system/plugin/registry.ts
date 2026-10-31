/**
 * 플러그인 활성 — 정적 번들. 모듈 배열을 받아 코어 먼저, 목록 순으로 activate 한다.
 *
 * 🔴 activateAll 은 React 가 뜨기 전 main.tsx 에서 **한 번** 부른다(effect 안에서 안 부른다 — StrictMode 가 두 번 돈다).
 * 🔴 activate 가 던져도 **그 플러그인만** 실패하고 나머지는 계속 산다 — 하나가 앱을 못 뜨게 하면 안 된다.
 *
 * ⛔ 끄기/켜기(수명주기)·자리표시는 P2 다. 여기선 활성만.
 */
import type { PluginModule } from './types';
import { makeHost } from './host';

export function activateAll(modules: PluginModule[]): void {
    // 코어(core:true) 를 앞으로 — 안정 정렬이라 같은 급은 목록 순이 남는다
    const sorted = [...modules].sort((a, b) => Number(!!b.manifest.core) - Number(!!a.manifest.core));
    for (const m of sorted) {
        try {
            const host = makeHost(m.manifest.id);
            void m.activate(host);
        } catch (e) {
            console.error(`[plugin] "${m.manifest.id}" 활성 실패 — 나머지는 계속`, e);
        }
    }
}
