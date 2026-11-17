/**
 * F10b 가져올 때 따로 둔 것(extras.ts)의 저장 — host.store(IndexedDB · 큰 값용) 한 칸. 깨진 값은 빈 것으로 읽는다.
 */
import type { PluginHost } from '../../pane-ui-system/plugin';
import { emptyExtras } from './extras';
import type { V1Extras } from './extras';

export const EXTRAS_KEY = 'v1-extras';

/** 저장값(또는 아무 값) → 쓸 수 있는 꼴. 모르는 모양은 칸마다 빈 값으로. */
export function normalizeExtras(raw: unknown): V1Extras {
    const base = emptyExtras();
    const o = raw as Partial<V1Extras> | null;
    if (!o || typeof o !== 'object' || o.version !== 1) return base;
    const map = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Record<string, unknown>>) : {});
    const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
    return {
        version: 1,
        agents: map(o.agents), resources: map(o.resources), activities: map(o.activities), demands: map(o.demands),
        tracks: map(o.tracks), specs: map(o.specs), timetables: map(o.timetables), assignments: map(o.assignments),
        extraAssignments: arr(o.extraAssignments), rules: arr(o.rules), boards: arr(o.boards),
    };
}

export const loadExtras = async (host: Pick<PluginHost, 'store'>): Promise<V1Extras> =>
    normalizeExtras(await host.store.get<unknown>(EXTRAS_KEY, null));

export const saveExtras = (host: Pick<PluginHost, 'store'>, extras: V1Extras): Promise<boolean> =>
    host.store.set(EXTRAS_KEY, extras);
