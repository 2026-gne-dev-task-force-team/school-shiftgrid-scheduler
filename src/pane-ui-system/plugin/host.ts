/**
 * 호스트 객체 공장 — makeHost(pluginId) 가 플러그인마다 객체 하나를 만든다.
 *
 * 🔴 ⛔ 이게 「주인 없는 등록」을 막는 장치다 — 등록은 전부 이 객체를 거쳐 주인 꼬리표가 붙는다.
 *    바깥(앱)도 같은 길을 쓴다(주인 'app'). registerView 직접 호출은 P0 뒤 수출에서 빠진다.
 *
 * ⭐ viewId 접두사 강제 — 등록 id 가 `${pluginId}.` 로 시작 안 하면 붙인다(demo → demo.sheet).
 *    🔑 그 덕에 저장된 leaf 의 viewId 만 보고 주인을 안다(꺼진 플러그인의 탭이 자리표시가 되는 데 묘비가 필요 없다).
 */
import {
    registerView, unregisterView, getView, listViews, listRibbonViews,
} from '../view-registry';
import { storageKey } from '../storage';
import { HOST_VERSION } from './types';
import type { PluginHost, RibbonAction, WorkspaceOpenOptions } from './types';
import { track, addRibbonAction, getWorkspaceBridge } from './store';

export function makeHost(pluginId: string): PluginHost {
    const scoped = (id: string) => (id.startsWith(`${pluginId}.`) ? id : `${pluginId}.${id}`);
    const skey = (key: string) => storageKey(`plugin.${pluginId}.${key}`);

    return {
        id: pluginId,
        hostVersion: HOST_VERSION,

        views: {
            register(def) {
                const full = scoped(def.id);
                registerView({ ...def, id: full });
                return track(pluginId, { dispose() { unregisterView(full); } });
            },
            get(id) { return getView(id); },
            list() { return listViews(); },
            listRibbon() { return listRibbonViews(); },
        },

        ribbon: {
            add(a: RibbonAction) { return track(pluginId, addRibbonAction(pluginId, a)); },
        },

        workspace: {
            open(viewId: string, o?: WorkspaceOpenOptions) {
                return getWorkspaceBridge()?.open(viewId, o) ?? null;
            },
            close(leafId: string) {
                getWorkspaceBridge()?.close(leafId);
            },
        },

        storage: {
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
        },
    };
}
