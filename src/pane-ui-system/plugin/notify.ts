/**
 * 알림 — 창틀이 한 곳에서 쥔다(host.notify). 토스트(잠깐 뜸) + 기록(알림 패널).
 *
 * 🔴 ⛔ 도메인 0 · 색 0 — 여기는 「누가 무엇을 언제 알렸나」만 쥔다(구조 검사 ①⑤).
 * ⭐ 동작(action)은 함수가 아니라 명령 id 로만 받는다(매니페스트가 함수를 못 받는 것과 같은 결) — 눌리면 runCommand.
 * ⭐ key 가 같으면(같은 보낸이) 떠 있는 토스트만 덮는다 — 같은 알림이 폭주해 토스트가 쌓이지 않게. 기록엔 전부 쌓인다.
 * ⭐ 단추(action)는 한 번 쓰면 끝(actionUsed) — 토스트·패널 어디서든 다시 안 눌린다.
 * 🔴 단추는 낡을 수 있다(C1) — action.args(대상 토큰)를 명령 맥락으로 넘기고, 명령의 enabled(ctx) 가 false 면
 *    안 부르고 회색 + unavailable 문구(actionState). 새로고침 뒤 불러온 기록의 단추는 만료(actionExpired) — 되살린 메모리 상태가 없다.
 * ⭐ 기록 보관 개수는 창틀 설정 notifyRetain(기본 200 · 0 = 이 세션 메모리에만, 새로고침하면 비움). 기기별 저장.
 *    기록 저장이 실패해도 던지지도·보고하지도 않는다(저장 실패 → 알림 → 저장 실패 되먹임 방지).
 */
import { useSyncExternalStore } from 'react';
import { storageKey } from '../storage';
import { getPaneSettings } from '../layout/pane-settings';
import { runCommand, commandEnabled } from './store';
import type { JsonValue } from '../json';

export type NotifyLevel = 'info' | 'success' | 'warn' | 'error';

/** 알림에 붙는 단추 — 명령 id 로만(함수 금지). args 는 명령 맥락 ctx.args 로 넘어간다(대상 토큰 등 · 데이터뿐). */
export interface NotifyAction {
    label: string;
    commandId: string;
    args?: JsonValue;
    /** 명령이 지금 안 될 때(enabled=false) 단추 옆에 보일 까닭 — 없으면 기본 문구 */
    unavailable?: string;
}

export interface NotifyInput {
    level?: NotifyLevel;
    title: string;
    body?: string;
    action?: NotifyAction;
    /** ms — 기본 5000 · error 는 기본 0 · 0 = 닫을 때까지 */
    timeout?: number;
    /** 같은 보낸이의 같은 key 는 떠 있는 토스트만 덮는다(기록엔 다 쌓인다) */
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
    /** 단추를 이미 눌렀다 */
    actionUsed?: boolean;
    /** 새로고침 뒤 불러온 기록 — 단추가 가리키던 메모리 상태가 없어 못 쓴다 */
    actionExpired?: boolean;
}

/** 단추 상태 — ready 누를 수 있음 · used 이미 씀 · stale 낡음(까닭 문구 reason) */
export type NotifyActionState = { kind: 'none' } | { kind: 'ready' } | { kind: 'used' } | { kind: 'stale'; reason: string };
const DEFAULT_UNAVAILABLE = '이미 다른 작업이 있어 할 수 없습니다';
const EXPIRED_REASON = '새로 고친 뒤라 쓸 수 없습니다';

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
        }).slice(-retain())
            // 🔴 불러온 단추는 만료 — 되돌리기 더미 같은 메모리 상태는 새로고침에 안 살아남는다(C1)
            .map((i) => (i.action && !i.actionUsed ? { ...i, actionExpired: true } : i));
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
        for (const old of items) if (old.owner === owner && old.key === input.key) hideToast(old.id);
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

/** 단추의 지금 상태 — 렌더가 부른다(회색·까닭 문구). 명령 쪽 enabled(ctx) 를 그때그때 묻는다. */
export function actionState(it: NotifyItem): NotifyActionState {
    const a = it.action;
    if (!a) return { kind: 'none' };
    if (it.actionUsed) return { kind: 'used' };
    if (it.actionExpired) return { kind: 'stale', reason: EXPIRED_REASON };
    if (!commandEnabled(a.commandId, ctxOf(a))) return { kind: 'stale', reason: a.unavailable ?? DEFAULT_UNAVAILABLE };
    return { kind: 'ready' };
}

const ctxOf = (a: NotifyAction) => (a.args === undefined ? undefined : { args: a.args });

/** 알림의 단추를 누른다 — 명령을 부르고 토스트를 걷고 읽음으로. 낡았으면 안 부르고 다시 그리게만(회색 + 까닭). */
export function runNotifyAction(id: string): void {
    const it = items.find((i) => i.id === id);
    if (!it?.action) return;
    if (actionState(it).kind !== 'ready') { emit(); return; }
    hideToast(id);
    items = items.map((i) => (i.id === id ? { ...i, read: true, actionUsed: true } : i));
    persist();
    emit();
    runCommand(it.action.commandId, ctxOf(it.action));
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
