/**
 * 호스트 객체 공장 — makeHost(pluginId) 가 플러그인마다 객체 하나를 만든다.
 *
 * 🔴 ⛔ 이게 「주인 없는 등록」을 막는 장치다 — 등록은 전부 이 객체를 거쳐 주인 꼬리표가 붙는다.
 *    바깥(앱)도 같은 길을 쓴다(주인 'app'). registerView 직접 호출은 수출에서 빠졌다(구조 검사 ⑥).
 *
 * ⭐ viewId 접두사 강제 — 등록 id 가 `${pluginId}.` 로 시작 안 하면 붙인다(scheduler → scheduler.week).
 *    🔑 그 덕에 저장된 leaf 의 viewId 만 보고 주인을 안다(꺼진 플러그인의 탭이 자리표시가 되는 데 묘비가 필요 없다).
 */
import { getView, listViews } from '../view-registry';
import { storageKey } from '../storage';
import { kvGet, kvSet, kvDel, kvAvailable, kvEstimate } from '../kv';
import { NARROW_PX } from '../layout/panels';
import { resolveMode, onThemeApplied } from '../theme/apply';
import { loadThemeSettings } from '../theme/settings';
import { HOST_VERSION } from './types';
import { resolveModule } from './registry';
import { declareOne } from './contributes';
import type { NotifyInput } from './notify';
import type { PluginHost, PluginImpl, PluginManifest, DeclareInput, WorkspaceOpenOptions, TabMenuContext, WorkspaceEvent, WorkspaceLeafInfo } from './types';
import type { MenuEntry } from '../primitives/ContextMenu';
import {
    track, getWorkspaceBridge, whenWorkspaceReady, runCommand,
    addTabMenuItem, onWorkspace,
} from './store';
import { reportStorageError, classifyStorageError } from './storage-errors';
import { notify, dismiss } from './notify';

const FIRST_RUN_KEY = '__first-run';

/**
 * 저장된 배치가 깨졌거나 텅 비어 기본 배치를 다시 깔아야 할 때, 모든 플러그인의 첫 실행 플래그를 지운다.
 *   🔴 onFirstRun 이 whenWorkspaceReady 안에서 플래그를 확인하므로, 다리가 서기 전(initialWorkspace)에
 *      이 함수를 부르면 대기 중이던 onFirstRun 일감들이 정상 실행되어 기본 화면을 복구한다.
 */
export function resetFirstRunFlags(): void {
    try {
        if (typeof localStorage === 'undefined') return;
        const prefix = storageKey('plugin.');
        const suffix = `.${FIRST_RUN_KEY}`;
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix) && k.endsWith(suffix)) keys.push(k);
        }
        for (const k of keys) localStorage.removeItem(k);
    } catch { /* 조용히 */ }
}

export function makeHost(pluginId: string, impl?: PluginImpl, manifest?: PluginManifest): PluginHost {
    const skey = (key: string) => storageKey(`plugin.${pluginId}.${key}`);

    const storage = {
        get<T>(key: string, fallback: T): T {
            try {
                if (typeof localStorage === 'undefined') return fallback;
                const s = localStorage.getItem(skey(key));
                return s == null ? fallback : (JSON.parse(s) as T);
            } catch {
                try { localStorage.removeItem(skey(key)); } catch { /* 조용히 */ }
                return fallback;
            }
        },
        set(key: string, v: unknown) {
            if (typeof localStorage === 'undefined') return;
            try {
                localStorage.setItem(skey(key), JSON.stringify(v));
            } catch (e) {
                // 🔴 삼키던 것을 보고로 바꾼다 — 넘치면(QuotaExceededError) 'quota', 그 밖은 'unknown'.
                //    여전히 throw 하지 않는다(부르는 쪽이 전부 동기라 터지면 UI 가 죽는다) — 보고만 한다.
                reportStorageError({ scope: 'local', key: skey(key), reason: classifyStorageError(e), at: Date.now() });
            }
        },
        remove(key: string) {
            if (typeof localStorage === 'undefined') return;
            try { localStorage.removeItem(skey(key)); } catch { /* 삭제 실패는 유실이 아니다 — 조용히 */ }
        },
    };

    // 🔴 큰 저장(비동기 kv) — 키를 host.storage 와 같은 꼴로 가둔다. storageKey 접두사는 kv DB 이름에 이미
    //    들어갔으니 여기선 안 붙인다(skey 와 달리 storageKey 로 감싸지 않는다 — 그러면 두 번 붙는다).
    const kkey = (key: string) => `plugin.${pluginId}.${key}`;
    const store = {
        async get<T>(key: string, fallback: T): Promise<T> {
            const v = await kvGet<T>(kkey(key));
            return v == null ? fallback : v;
        },
        set(key: string, v: unknown): Promise<boolean> { return kvSet(kkey(key), v); },
        del(key: string): Promise<void> { return kvDel(kkey(key)); },
        available(): Promise<boolean> { return kvAvailable(); },
        estimate(): Promise<{ usage: number; quota: number } | null> { return kvEstimate(); },
    };

    const host: PluginHost = {
        id: pluginId,
        hostVersion: HOST_VERSION,

        // 🔴 ⛔ 옛 등록 5종(views.register·ribbon.add·commands.add·settings.add*·statusBar.add)은 D5③ 에서 지웠다.
        //    이제 플러그인이 호스트에 꽂는 길은 manifest.contributes 와 host.declare 둘뿐이다(둘 다 declareOne 으로 간다).
        //    여기 남는 건 읽기·동작(views.get/list·commands.run)뿐 — 등록이 아니다. 구조 검사 ⑰ 이 매니페스트 밖 등록 0건을 지킨다.
        views: {
            get(id) { return getView(id); },
            list() { return listViews(); },
        },

        commands: {
            // run(id) 는 동작(「옛 길」이 아니다) — 리본·메뉴·팔레트가 명령을 부르는 창구. add 는 지웠다(contributes·declare 로).
            run(id, ctx) { return runCommand(id, ctx); },
        },

        menu: {
            addTabMenuItem(fn: (ctx: TabMenuContext) => MenuEntry[]) {
                return track(pluginId, addTabMenuItem(pluginId, fn));
            },
        },

        workspace: {
            open(viewId: string, o?: WorkspaceOpenOptions) {
                const b = getWorkspaceBridge();
                if (!b) {
                    // 🔴 다리가 아직 없다 — activateAll/attach 가 시동 중에 열려 하면 조용히 null 만 주고 사라진다(ad43f55).
                    //    onFirstRun 은 whenWorkspaceReady 로 미루니 정상이고, 그 밖에서 여기 오면 보이게 경고한다.
                    console.warn(`[plugin] "${pluginId}" 가 작업대 다리가 서기 전에 workspace.open("${viewId}") 를 불렀다 — onFirstRun/구독으로 미뤄라`);
                    return null;
                }
                return b.open(viewId, o) ?? null;
            },
            close(leafId: string) { getWorkspaceBridge()?.close(leafId); },
            on(ev: WorkspaceEvent, fn: (leaf: WorkspaceLeafInfo) => void) {
                return track(pluginId, onWorkspace(pluginId, ev, fn));
            },
        },

        screen: {
            narrow() {
                if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
                return window.matchMedia(`(max-width: ${NARROW_PX - 1}px)`).matches;
            },
            on(fn: (narrow: boolean) => void) {
                if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
                    return { dispose() { /* 없음 */ } };
                }
                const mq = window.matchMedia(`(max-width: ${NARROW_PX - 1}px)`);
                const h = (e: MediaQueryListEvent) => fn(e.matches);
                mq.addEventListener('change', h);
                return track(pluginId, { dispose() { mq.removeEventListener('change', h); } });
            },
        },

        theme: {
            mode() { return resolveMode(loadThemeSettings().mode); },
            on(fn: (m: 'light' | 'dark') => void) {
                return track(pluginId, { dispose: onThemeApplied(fn) });
            },
        },

        storage,
        store,

        notify: Object.assign((input: NotifyInput) => notify(pluginId, input), { dismiss }),

        onFirstRun(fn: () => void) {
            // 저장값 없이 그 플러그인이 처음 켜질 때 한 번 — 기기별 플래그로 가린다.
            // 🔴 ⛔ 여기서 바로 돌리지 않는다. activateAll 은 React 렌더보다 먼저 돌아(main.tsx) 작업대 다리가 아직 없고,
            //    그 상태에서 workspace.open 을 부르면 조용히 null 을 주고 사라진다. 그런데 플래그는 켜지니
            //    「첫 실행 기본 배치가 영영 안 깔리는」 상태로 굳는다(실측 2026-11-02 — 깨끗한 프로파일에서 좌우 패널이 빈 채였다).
            // ⭐ 그래서 다리가 설 때까지 미루고, 플래그 검사도 **다리가 서서 실제로 돌 시점**에 한다(그 사이 빈 창 복구로
            //    resetFirstRunFlags 가 불렸으면 대기 중이던 일감이 살아나 기본 배치를 다시 깐다).
            whenWorkspaceReady(() => {
                if (storage.get<boolean>(FIRST_RUN_KEY, false)) return;
                storage.set(FIRST_RUN_KEY, true);
                try { fn(); } catch (e) { console.error(`[plugin] "${pluginId}" onFirstRun 실패`, e); }
            });
        },

        // 🔴 M0 — 모듈 소비(인터페이스 이름으로). ⛔ requires·supports·자기 provides 에 선언한 이름만 — 안 선언하면 던진다.
        //    supports 인데 제공자 없음 → null. requires 는 블록 덕에 평소 차 있다. 바인딩·scope 는 resolveModule 이 쥔다.
        modules: {
            use<T = unknown>(name: string): T | null {
                const declared = !!(manifest?.provides?.[name] || manifest?.requires?.[name] || manifest?.supports?.[name]);
                if (!declared) {
                    throw new Error(`[plugin] "${pluginId}" 가 선언 안 한 인터페이스 "${name}" 를 use 한다 — requires/supports/provides 에 적어라`);
                }
                const mod = resolveModule(name, pluginId);
                return (mod === undefined ? null : (mod as T));
            },
        },

        // 🔴 동적 선언 창구 하나 — contributes 항목과 같은 타입·같은 검증·같은 꽂기 경로(declareOne).
        //    impl(이 플러그인의 components·commands·panes·renders)에서 이름으로 구현을 찾는다. 없으면 던진다.
        declare(item: DeclareInput) {
            return declareOne(item, impl ?? {}, host, 'declare');
        },
    };
    return host;
}
