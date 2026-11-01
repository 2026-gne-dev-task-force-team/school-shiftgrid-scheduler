/**
 * 호스트 객체 공장 — makeHost(pluginId) 가 플러그인마다 객체 하나를 만든다.
 *
 * 🔴 ⛔ 이게 「주인 없는 등록」을 막는 장치다 — 등록은 전부 이 객체를 거쳐 주인 꼬리표가 붙는다.
 *    바깥(앱)도 같은 길을 쓴다(주인 'app'). registerView 직접 호출은 수출에서 빠졌다(구조 검사 ⑥).
 *
 * ⭐ viewId 접두사 강제 — 등록 id 가 `${pluginId}.` 로 시작 안 하면 붙인다(scheduler → scheduler.week).
 *    🔑 그 덕에 저장된 leaf 의 viewId 만 보고 주인을 안다(꺼진 플러그인의 탭이 자리표시가 되는 데 묘비가 필요 없다).
 */
import {
    registerView, unregisterView, getView, listViews,
} from '../view-registry';
import { storageKey } from '../storage';
import { NARROW_PX } from '../layout/panels';
import { resolveMode, onThemeApplied } from '../theme/apply';
import { loadThemeSettings } from '../theme/settings';
import { HOST_VERSION } from './types';
import { getPluginApi } from './registry';
import type { PluginHost, WorkspaceOpenOptions, CommandDef, SettingsContribution, StatusContribution, RibbonAddInput, TabMenuContext, WorkspaceEvent, WorkspaceLeafInfo } from './types';
import type { MenuEntry } from '../primitives/ContextMenu';
import {
    track, addRibbonAction, getWorkspaceBridge,
    addCommand, getCommand, runCommand,
    addSettingsSection, addSettingsItem,
    addStatusItem, addTabMenuItem, setNewTab, onWorkspace, touchContrib,
} from './store';

export function makeHost(pluginId: string): PluginHost {
    const scoped = (id: string) => (id.startsWith(`${pluginId}.`) ? id : `${pluginId}.${id}`);
    const skey = (key: string) => storageKey(`plugin.${pluginId}.${key}`);

    const storage = {
        get<T>(key: string, fallback: T): T {
            try {
                if (typeof localStorage === 'undefined') return fallback;
                const s = localStorage.getItem(skey(key));
                return s == null ? fallback : (JSON.parse(s) as T);
            } catch { return fallback; }
        },
        set(key: string, v: unknown) {
            try {
                if (typeof localStorage === 'undefined') return;
                localStorage.setItem(skey(key), JSON.stringify(v));
            } catch { /* 조용히 */ }
        },
    };

    return {
        id: pluginId,
        hostVersion: HOST_VERSION,

        views: {
            register(def) {
                const full = scoped(def.id);
                const { newTab, ...rest } = def;
                registerView({ ...rest, id: full });
                touchContrib();   // 뷰가 늘면 리본·뷰 목록이 바뀐다 — 다시 그리게
                const d = track(pluginId, { dispose() { unregisterView(full); touchContrib(); } });
                // 「+ 새 탭」이 여는 것 — 한 칸(뒤가 이긴다). dispose 는 따로 track 한다
                if (newTab) track(pluginId, setNewTab(pluginId, full, newTab.label));
                return d;
            },
            get(id) { return getView(id); },
            list() { return listViews(); },
        },

        ribbon: {
            add(a: RibbonAddInput) {
                // 🔴 리본 동작은 명령을 가리킨다 — label·run 을 명령에서 푼다(없으면 경고하고 빈 동작).
                const cmd = getCommand(a.commandId);
                if (!cmd) console.warn(`[plugin] 리본 동작이 없는 명령을 가리킨다: ${a.commandId}`);
                return track(pluginId, addRibbonAction(pluginId, {
                    id: a.commandId,
                    icon: a.icon ?? cmd?.icon ?? 'dot',
                    label: cmd?.title ?? a.commandId,
                    run: cmd?.run ?? (() => { /* 없는 명령 */ }),
                    order: a.order,
                }));
            },
        },

        commands: {
            add(c: CommandDef) { return track(pluginId, addCommand(pluginId, c)); },
            run(id, ctx) { return runCommand(id, ctx); },
        },

        settings: {
            addSection(id: string, title: string, icon) {
                return track(pluginId, addSettingsSection(pluginId, id, title, icon));
            },
            addItem(i: SettingsContribution) { return track(pluginId, addSettingsItem(pluginId, i)); },
        },

        statusBar: {
            add(i: StatusContribution) { return track(pluginId, addStatusItem(pluginId, i)); },
        },

        menu: {
            addTabMenuItem(fn: (ctx: TabMenuContext) => MenuEntry[]) {
                return track(pluginId, addTabMenuItem(pluginId, fn));
            },
        },

        workspace: {
            open(viewId: string, o?: WorkspaceOpenOptions) {
                return getWorkspaceBridge()?.open(viewId, o) ?? null;
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

        onFirstRun(fn: () => void) {
            // 저장값 없이 그 플러그인이 처음 켜질 때 한 번 — 기기별 플래그로 가린다.
            if (storage.get<boolean>('__first-run', false)) return;
            storage.set('__first-run', true);
            try { fn(); } catch (e) { console.error(`[plugin] "${pluginId}" onFirstRun 실패`, e); }
        },

        plugins: {
            // 🔴 N4 — 다른 플러그인 공개 api. 호출자(pluginId)와 track 을 넘긴다:
            //   상대가 호출자별 팩토리면 그걸로 바인딩하고, 상대가 낸 Disposable 은 이 호출자 소유로 모아
            //   둔다(이 플러그인이 꺼지면 상대 쪽 등록도 같이 회수된다 — 노드가 회색이 되는 길).
            get<T = unknown>(id: string): T | undefined {
                return getPluginApi<T>(id, pluginId, (d) => track(pluginId, d));
            },
        },
    };
}
