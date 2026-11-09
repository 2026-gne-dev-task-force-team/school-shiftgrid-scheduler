/**
 * 알림 — 창틀이 한 곳에서 쥔다(host.notify). 토스트(잠깐 뜸) + 기록(알림 패널).
 *
 * 🔴 ⛔ 도메인 0 · 색 0 — 여기는 「누가 무엇을 언제 알렸나」만 쥔다(구조 검사 ①⑤).
 * ⭐ 동작(action)은 함수가 아니라 명령 id 로만 받는다(매니페스트가 함수를 못 받는 것과 같은 결) — 눌리면 runCommand.
 * ⭐ key 가 같으면(같은 보낸이) 덮어 쓴다 — 같은 알림이 폭주해 토스트가 쌓이지 않게.
 * ⭐ 기록 보관 개수는 창틀 설정 notifyRetain(기본 200 · 0 = 이 세션 메모리에만, 새로고침하면 비움). 기기별 저장.
 *    기록 저장이 실패해도 던지지도·보고하지도 않는다(저장 실패 → 알림 → 저장 실패 되먹임 방지).
 */
import { useSyncExternalStore } from 'react';
import { storageKey } from '../storage';
import { getPaneSettings } from '../layout/pane-settings';
import { runCommand } from './store';

export type NotifyLevel = 'info' | 'success' | 'warn' | 'error';

/** 알림에 붙는 단추 — 명령 id 로만(함수 금지). */
export interface NotifyAction { label: string; commandId: string }

export interface NotifyInput {
    level?: NotifyLevel;
    title: string;
    body?: string;
    action?: NotifyAction;
    /** ms — 기본 5000 · error 는 기본 0 · 0 = 닫을 때까지 */
    timeout?: number;
    /** 같은 보낸이의 같은 key 는 덮어 쓴다 */
    key?: string;
}

export interface NotifyItem {
    id: string;
    /** 보낸 플러그인 id — 창틀이 붙인다(보내는 쪽이 못 속인다) */
    owner: string;
    level: NotifyLevel;
    title: string;
    body?: string;
    action?: NotifyAction;
    key?: string;
    at: number;
    read: boolean;
}

export interface NotifySnapshot { items: NotifyItem[]; toasts: NotifyItem[]; unread: number }

const DEFAULT_TIMEOUT = 5000;
const MAX_TOASTS = 4;
const MEMORY_CAP = 200;          // 보관 0 일 때 세션 메모리 상한
const LEVELS: NotifyLevel[] = ['info', 'success', 'warn', 'error'];

const histKey = () => storageKey('notify.history');

let items: NotifyItem[] = [];
let toastIds: string[] = [];
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let loaded = false;
let seq = 0;
let cache: NotifySnapshot | null = null;
const listeners = new Set<() => void>();

function emit(): void { cache = null; for (const l of listeners) l(); }

const retain = (): number => getPaneSettings().notifyRetain;

/** 저장된 기록을 한 번 읽는다 — 늦게(첫 조회 때): setStoragePrefix 전에 읽으면 키가 굳는다. 모양 틀린 줄은 버린다. */
function ensure(): void {
    if (loaded) return;
    loaded = true;
    if (retain() === 0) return;
    try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(histKey());
        const arr: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return;
        items = arr.filter((x): x is NotifyItem => {
            const o = x as Partial<NotifyItem> | null;
            return !!o && typeof o.id === 'string' && typeof o.owner === 'string' && typeof o.title === 'string'
                && typeof o.at === 'number' && LEVELS.includes(o.level as NotifyLevel);
        }).slice(-retain());
    } catch { /* 깨진 기록은 비운 채 시작 */ }
}

function persist(): void {
    try {
        if (typeof localStorage === 'undefined') return;
        if (retain() === 0) localStorage.removeItem(histKey());
        else localStorage.setItem(histKey(), JSON.stringify(items.slice(-retain())));
    } catch { /* 되먹임 방지 — 조용히 */ }
}

function clearTimer(id: string): void {
    const t = timers.get(id);
    if (t !== undefined) { clearTimeout(t); timers.delete(id); }
}

function hideToast(id: string): void {
    clearTimer(id);
    toastIds = toastIds.filter((x) => x !== id);
}

function trim(): void {
    const cap = retain() || MEMORY_CAP;
    while (items.length > cap) { hideToast(items[0].id); items.shift(); }
}

/** 알린다 — 토스트를 띄우고 기록에 쌓는다. 돌려주는 id 로 dismiss 한다. */
export function notify(owner: string, input: NotifyInput): string {
    ensure();
    const level = input.level ?? 'info';
    if (input.key !== undefined) {
        const old = items.find((i) => i.owner === owner && i.key === input.key);
        if (old) { hideToast(old.id); items = items.filter((i) => i !== old); }
    }
    const id = `${Date.now().toString(36)}-${++seq}`;
    items = [...items, {
        id, owner, level, title: input.title, body: input.body, action: input.action, key: input.key,
        at: Date.now(), read: false,
    }];
    toastIds = [...toastIds, id];
    while (toastIds.length > MAX_TOASTS) hideToast(toastIds[0]);
    const ms = input.timeout ?? (level === 'error' ? 0 : DEFAULT_TIMEOUT);
    if (ms > 0) timers.set(id, setTimeout(() => { hideToast(id); emit(); }, ms));
    trim();
    persist();
    emit();
    return id;
}

/** 토스트만 걷는다(기록엔 남는다). */
export function dismiss(id: string): void {
    if (!toastIds.includes(id)) return;
    hideToast(id);
    emit();
}

/** 알림의 단추를 누른다 — 명령을 부르고 토스트를 걷고 읽음으로. */
export function runNotifyAction(id: string): void {
    const it = items.find((i) => i.id === id);
    if (!it?.action) return;
    hideToast(id);
    items = items.map((i) => (i.id === id ? { ...i, read: true } : i));
    persist();
    emit();
    runCommand(it.action.commandId);
}

export function markAllRead(): void {
    ensure();
    if (!items.some((i) => !i.read)) return;
    items = items.map((i) => (i.read ? i : { ...i, read: true }));
    persist();
    emit();
}

/** 기록을 전부 비운다(토스트도). */
export function clearNotifications(): void {
    ensure();
    for (const id of [...toastIds]) hideToast(id);
    items = [];
    persist();
    emit();
}

/** 설정에서 보관 개수가 바뀌면 부른다 — 넘치는 옛 기록을 자르고 저장을 맞춘다. */
export function applyNotifyRetain(): void {
    ensure();
    trim();
    persist();
    emit();
}

function snapshot(): NotifySnapshot {
    ensure();
    if (!cache) {
        const shown = new Set(toastIds);
        cache = { items, toasts: items.filter((i) => shown.has(i.id)), unread: items.filter((i) => !i.read).length };
    }
    return cache;
}

/** 비(非)React 조회 — 테스트·호스트용 */
export function getNotifications(): NotifySnapshot { return snapshot(); }

/** React 구독 */
export function useNotifications(): NotifySnapshot {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        snapshot,
        snapshot,
    );
}

/** 테스트 전용 — 모듈 상태를 처음으로 */
export function __resetNotifyForTest(): void {
    for (const id of [...timers.keys()]) clearTimer(id);
    items = []; toastIds = []; loaded = false; cache = null; seq = 0;
}
