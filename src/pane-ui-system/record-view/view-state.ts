/**
 * 레코드 뷰 보기 상태 — 기본값·정규화·보관(localStorage). viewKey 마다 한 벌.
 *
 * 🔴 창틀은 자기를 쓰는 앱 이름을 모른다 — storageKey 접두사(setStoragePrefix)를 거쳐 키를 만든다.
 *    ⚠️ 저장이 막혀도(사파리 프라이빗) 조용히 기본값으로 산다(목록은 그냥 안 기억될 뿐 고장 아님).
 */
import { storageKey } from '../storage';
import type { FilterRule, RecordViewState, SortRule } from './types';

/** 칸 폭 기본값 — field.width 도 state.widths 도 없을 때 */
export const DEFAULT_COL_WIDTH = 170;
/** 끌어서 줄일 수 있는 최소 폭 */
export const MIN_COL_WIDTH = 72;

export function defaultState(): RecordViewState {
    return { kind: 'table', search: '', filters: [], sorts: [], hidden: [], widths: {} };
}

const KEY = (viewKey: string) => storageKey(`record-view.${viewKey}`);

/** 아무 값(JSON 파싱 결과·옛 판)을 안전한 RecordViewState 로 — 모르는 모양은 기본값으로 떨군다. */
export function normalizeState(raw: unknown): RecordViewState {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const o = raw as Record<string, unknown>;

    const search = typeof o.search === 'string' ? o.search : '';

    const filters: FilterRule[] = Array.isArray(o.filters)
        ? o.filters
            .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
            .filter((f) => typeof f.key === 'string' && typeof f.op === 'string')
            .map((f) => {
                const rule: FilterRule = { key: f.key as string, op: f.op as FilterRule['op'] };
                if (typeof f.value === 'string' || typeof f.value === 'number') rule.value = f.value;
                return rule;
            })
        : [];

    const sorts: SortRule[] = Array.isArray(o.sorts)
        ? o.sorts
            .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
            .filter((s) => typeof s.key === 'string' && (s.dir === 'asc' || s.dir === 'desc'))
            .map((s) => ({ key: s.key as string, dir: s.dir as 'asc' | 'desc' }))
        : [];

    const hidden: string[] = Array.isArray(o.hidden)
        ? o.hidden.filter((k): k is string => typeof k === 'string')
        : [];

    const widths: Record<string, number> = {};
    if (o.widths && typeof o.widths === 'object') {
        for (const [k, v] of Object.entries(o.widths as Record<string, unknown>)) {
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) widths[k] = v;
        }
    }

    return { kind: 'table', search, filters, sorts, hidden, widths };
}

export function loadState(viewKey: string): RecordViewState {
    try {
        const raw = localStorage.getItem(KEY(viewKey));
        if (!raw) return defaultState();
        return normalizeState(JSON.parse(raw));
    } catch {
        return defaultState();
    }
}

export function saveState(viewKey: string, state: RecordViewState): void {
    try {
        localStorage.setItem(KEY(viewKey), JSON.stringify(state));
    } catch {
        // 저장 막힘(프라이빗 모드·용량) — 조용히 지나간다(보기 상태는 유실돼도 자료가 아니다)
    }
}
