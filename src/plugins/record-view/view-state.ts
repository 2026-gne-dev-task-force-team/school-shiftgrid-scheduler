/**
 * 보기 정의(ViewDef) — 기본값·정규화(옛 RecordViewState 를 올리는 길 포함)·보관(localStorage).
 *
 * 🔴 보기 정의는 「자료를 보는 창」이다 — 필터·정렬·칸 순서·폭·숨김. 노드 얼굴은 이걸 노드 data 에 저장하고(공유·백업 대상),
 *    제어형 손님이 views 를 안 넘기면 여기 localStorage(viewKey · 기기별)에 둔다. 기기별로 남는 건 활성 탭 하나뿐이다.
 * 🔴 창틀은 자기를 쓰는 앱 이름을 모른다 — storageKey 접두사(setStoragePrefix)를 거쳐 키를 만든다.
 *    ⚠️ 저장이 막혀도(사파리 프라이빗) 조용히 기본값으로 산다(목록은 그냥 안 기억될 뿐 고장 아님).
 */
import { storageKey } from '../../pane-ui-system';
import type { RecordField, SortRule, ViewColumn, ViewDef } from './contracts/record-view';
import { normalizeFilter, EMPTY_FILTER } from './logic';

/** 칸 폭 기본값 — field.width 도 보기 폭도 없을 때 */
export const DEFAULT_COL_WIDTH = 170;
/** 끌어서 줄일 수 있는 최소 폭 */
export const MIN_COL_WIDTH = 72;

let seq = 0;
/** 짧은 안정 id — 칸·보기 키에 쓴다(`f_…`·`v_…`). 랜덤 꼬리가 기기 간 충돌을 막는다. */
export function uid(prefix: string): string {
    seq += 1;
    return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultView(fields: readonly RecordField[] = [], id = 'v_main', name = '표'): ViewDef {
    return { id, name, kind: 'table', filter: EMPTY_FILTER, sorts: [], columns: fields.map((f) => ({ key: f.key })) };
}

function normalizeSorts(raw: unknown): SortRule[] {
    return Array.isArray(raw)
        ? raw
            .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
            .filter((s) => typeof s.key === 'string' && (s.dir === 'asc' || s.dir === 'desc'))
            .map((s) => ({ key: s.key as string, dir: s.dir as 'asc' | 'desc' }))
        : [];
}

function normalizeColumns(raw: unknown): ViewColumn[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: ViewColumn[] = [];
    for (const c of raw) {
        if (!c || typeof c !== 'object') continue;
        const o = c as Record<string, unknown>;
        if (typeof o.key !== 'string' || o.key === '' || seen.has(o.key)) continue;
        seen.add(o.key);
        const col: ViewColumn = { key: o.key };
        if (typeof o.width === 'number' && Number.isFinite(o.width) && o.width > 0) col.width = o.width;
        if (o.hidden === true) col.hidden = true;
        if (o.wrap === true) col.wrap = true;
        out.push(col);
    }
    return out;
}

/**
 * 아무 값(JSON 파싱 결과·옛 판·깨진 값)을 안전한 ViewDef 로 — 모르는 모양은 기본값으로 떨군다.
 *   📌 옛 RecordViewState({filters·hidden·widths})도 받는다: 숨김·폭은 columns 로, filters 는 and 묶음으로 올라간다.
 */
export function normalizeView(raw: unknown, fallbackId = 'v_main'): ViewDef {
    const base = defaultView([], fallbackId);
    if (!raw || typeof raw !== 'object') return base;
    const o = raw as Record<string, unknown>;

    const id = typeof o.id === 'string' && o.id !== '' ? o.id : fallbackId;
    const name = typeof o.name === 'string' && o.name.trim() !== '' ? o.name : '표';
    const kind = o.kind === 'board' || o.kind === 'list' || o.kind === 'gallery' ? o.kind : 'table';

    let filter = EMPTY_FILTER;
    if (o.filter !== undefined) filter = normalizeFilter(o.filter);
    else if (Array.isArray(o.filters)) filter = normalizeFilter({ and: o.filters });   // 옛 꼴 — AND 목록

    let columns = normalizeColumns(o.columns);
    if (!Array.isArray(o.columns)) {
        // 옛 꼴 — hidden·widths 를 columns 로 올린다(나머지 칸은 reconcileColumns 가 뒤에 붙인다)
        const map = new Map<string, ViewColumn>();
        if (Array.isArray(o.hidden)) for (const k of o.hidden) if (typeof k === 'string') map.set(k, { key: k, hidden: true });
        if (o.widths && typeof o.widths === 'object') {
            for (const [k, v] of Object.entries(o.widths as Record<string, unknown>)) {
                if (typeof v === 'number' && Number.isFinite(v) && v > 0) map.set(k, { ...(map.get(k) ?? { key: k }), width: v });
            }
        }
        columns = [...map.values()];
    }

    const view: ViewDef = { id, name, kind, filter, sorts: normalizeSorts(o.sorts), columns };
    if (typeof o.frozen === 'number' && o.frozen > 0) view.frozen = Math.floor(o.frozen);
    if (o.group && typeof o.group === 'object' && typeof (o.group as Record<string, unknown>).key === 'string') {
        const g = o.group as Record<string, unknown>;
        view.group = { key: g.key as string, hideEmpty: g.hideEmpty === true };
        if (Array.isArray(g.order)) view.group.order = g.order.filter((x): x is string => typeof x === 'string');
    }
    if (o.calc && typeof o.calc === 'object') {
        const calc: Record<string, string> = {};
        for (const [k, v] of Object.entries(o.calc as Record<string, unknown>)) if (typeof v === 'string') calc[k] = v;
        if (Object.keys(calc).length > 0) view.calc = calc;
    }
    return view;
}

/** 칸 목록과 맞춘다 — 보기가 모르는 칸은 뒤에 붙이고, 없어진 칸은 뺀다. 이미 맞으면 같은 객체를 돌려준다(리렌더 폭주 방지). */
export function reconcileColumns(view: ViewDef, fields: readonly RecordField[]): ViewDef {
    const known = new Set(fields.map((f) => f.key));
    const have = new Set(view.columns.map((c) => c.key));
    const clean = view.columns.every((c) => known.has(c.key));
    const complete = fields.every((f) => have.has(f.key));
    if (clean && complete) return view;
    const kept = view.columns.filter((c) => known.has(c.key));
    const added = fields.filter((f) => !have.has(f.key)).map((f) => ({ key: f.key }));
    return { ...view, columns: [...kept, ...added] };
}

/** 보기 목록 정규화 — 최소 하나. id 가 겹치면 뒤엣것을 버린다. */
export function normalizeViews(raw: unknown): ViewDef[] {
    const list: unknown[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { views?: unknown }).views)
            ? (raw as { views: unknown[] }).views
            : raw && typeof raw === 'object' ? [raw] : [];
    const seen = new Set<string>();
    const out: ViewDef[] = [];
    list.forEach((r, i) => {
        const v = normalizeView(r, i === 0 ? 'v_main' : uid('v_'));
        if (seen.has(v.id)) return;
        seen.add(v.id);
        out.push(v);
    });
    return out.length > 0 ? out : [defaultView()];
}

// ── localStorage(제어형 손님이 views 를 안 넘길 때 · 활성 탭) ─────────────────────────
const KEY = (viewKey: string) => storageKey(`record-view.${viewKey}`);
const ACTIVE_KEY = (viewKey: string) => storageKey(`record-view.active.${viewKey}`);

export function loadViews(viewKey: string): ViewDef[] {
    try {
        const raw = localStorage.getItem(KEY(viewKey));
        if (!raw) return [defaultView()];
        return normalizeViews(JSON.parse(raw));
    } catch {
        return [defaultView()];
    }
}

export function saveViews(viewKey: string, views: ViewDef[]): void {
    try {
        localStorage.setItem(KEY(viewKey), JSON.stringify({ v: 2, views }));
    } catch {
        // 저장 막힘(프라이빗 모드·용량) — 조용히 지나간다(보기는 유실돼도 자료가 아니다)
    }
}

/** 활성 탭 id — 기기별(노드가 아니라 localStorage). */
export function loadActiveView(viewKey: string): string | null {
    try { return localStorage.getItem(ACTIVE_KEY(viewKey)); } catch { return null; }
}
export function saveActiveView(viewKey: string, id: string): void {
    try { localStorage.setItem(ACTIVE_KEY(viewKey), id); } catch { /* 조용히 */ }
}
