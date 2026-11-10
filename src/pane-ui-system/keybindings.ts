/**
 * 단축키 — 🔴 ⭐ 「모든 동작은 명령」의 키보드 창구(쥔님 2026-11-09 *"바인딩도 플랫폼에 넣자"*).
 *   명령이 기본 키를 `keys` 로 적고(CommandDef.keys), 사용자는 설정에서 명령마다 덮어쓴다(기기별 localStorage).
 *   전역 디스패처 하나가 keydown 을 받아 그 키를 쥔 명령을 runCommand 로 부른다.
 *
 * 키 글자: `Mod+Alt+Shift+P` 꼴. `Mod` = 맥 ⌘ / 그 밖 Ctrl. 맥의 Ctrl 은 `Ctrl` 로 따로 적는다.
 *   글자·숫자는 e.code 로 읽는다 — 한글 입력 중엔 e.key 가 'ㅔ' 라 Ctrl+P 가 안 먹는다.
 *
 * ⛔ 뷰 안 단축키(달력 화살표·페이지 서식)는 여기 안 온다 — 각 뷰 onKeyDown 이 초점 라우팅이다.
 *    뷰가 먼저 preventDefault 하면 전역은 양보한다(Ctrl+B 굵게 ↔ 사이드바 접기).
 */
import { useSyncExternalStore } from 'react';
import { storageKey } from './storage';
import { listCommands, runCommand } from './plugin/store';
import { onStorageKey } from './cross-tab';
import { isMacPlatform, isMod, isAlt, keyLabel } from './platform-keys';

/** 명령 id → 키 글자. '' = 사용자가 지운 것(기본 키도 끈다). */
export type KeyOverrides = Record<string, string>;

const MODS = ['Mod', 'Ctrl', 'Alt', 'Shift'] as const;
const isMac = isMacPlatform;

/** 키 글자를 한 꼴로 — 수식 키 순서 고정·글자 대문자. 빈 값·수식 키만이면 ''. */
export function normalizeKey(s: string): string {
    const parts = s.split('+').map((p) => p.trim()).filter(Boolean);
    if (s.endsWith('++')) parts.push('+');           // 'Mod++' — 키 자체가 '+'
    const mods = new Set<string>();
    let key = '';
    for (const p of parts) {
        const m = MODS.find((x) => x.toLowerCase() === p.toLowerCase());
        if (m) mods.add(m); else key = p.length === 1 ? p.toUpperCase() : p;
    }
    if (!key) return '';
    return [...MODS.filter((m) => mods.has(m)), key].join('+');
}

/** keydown → 키 글자. 수식 키만 눌렸으면 null. */
export function eventToKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, mac = isMac()): string | null {
    if (['Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'CapsLock', 'Process', 'HangulMode'].includes(e.key)) return null;
    const m = /^Key([A-Z])$|^Digit(\d)$/.exec(e.code);
    const key = m ? (m[1] ?? m[2]) : e.key === ' ' ? 'Space' : e.key;
    if (!key || key === 'Unidentified') return null;
    const mods: string[] = [];
    if (isMod(e, mac)) mods.push('Mod');
    if (mac && e.ctrlKey) mods.push('Ctrl');
    if (isAlt(e)) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    return normalizeKey([...mods, key].join('+'));
}

/** 보여 줄 글자 — 맥이면 ⌘⌥⇧⌃, 그 밖은 Ctrl+Alt+Shift. */
export function formatKey(k: string, mac = isMac()): string { return keyLabel(k, mac); }

// ── 사용자 재지정 저장소 ──
const overridesKey = () => storageKey('keybindings');
let cache: KeyOverrides | null = null;
const listeners = new Set<() => void>();

// 🔴 R3-X — 다른 탭이 단축키를 바꾸면 캐시를 버리고 다시 읽게 한다
onStorageKey(overridesKey, () => { cache = null; for (const l of listeners) l(); });

export function getKeyOverrides(): KeyOverrides {
    if (cache) return cache;
    try {
        const raw = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem(overridesKey()) ?? '{}') : {};
        cache = {};
        if (raw && typeof raw === 'object') for (const [id, v] of Object.entries(raw)) if (typeof v === 'string') cache[id] = normalizeKey(v);
    } catch { cache = {}; }
    return cache;
}
function save(o: KeyOverrides): void {
    cache = o;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(overridesKey(), JSON.stringify(o)); } catch { /* 조용히 — 다른 창틀 설정과 같다 */ }
    for (const l of listeners) l();
}
/** 명령 하나의 키를 바꾼다. '' = 끈다. */
export function setKeyOverride(id: string, key: string): void { save({ ...getKeyOverrides(), [id]: normalizeKey(key) }); }
/** 통째로 되돌려 놓는다 — 전부 기본값 알림의 「되돌리기」. */
export function restoreKeyOverrides(o: KeyOverrides): void { save({ ...o }); }
/** 기본 키로 되돌린다. */
export function resetKeyOverride(id: string): void { const o = { ...getKeyOverrides() }; delete o[id]; save(o); }
export function resetAllKeyOverrides(): void { save({}); }
export function useKeyOverrides(): KeyOverrides {
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getKeyOverrides, getKeyOverrides);
}

/** 지금 쓰이는 키 — 사용자 재지정이 이긴다. */
export function effectiveKey(id: string, def: string | undefined, o: KeyOverrides = getKeyOverrides()): string {
    return id in o ? o[id] : normalizeKey(def ?? '');
}

/** 키 글자 → 그 키를 쥔 명령 id 들(둘 이상이면 겹침). */
export function keyMap(o: KeyOverrides = getKeyOverrides()): Map<string, string[]> {
    const m = new Map<string, string[]>();
    for (const c of listCommands()) {
        const k = effectiveKey(c.id, c.keys, o);
        if (k) m.set(k, [...(m.get(k) ?? []), c.id]);
    }
    return m;
}

const editable = (t: EventTarget | null): boolean =>
    t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * keydown 하나를 처리한다 — 잡았으면 true. 🔴 겹치면 먼저 등록된 명령이 이긴다(설정 화면이 ⚠️ 로 알린다).
 *   입력칸 안에선 Mod/Ctrl/Alt 가 낀 키나 F 키만 — 맨 글자·Enter 는 글쓰기 몫이다.
 */
export function handleKeydown(e: KeyboardEvent): boolean {
    if (e.defaultPrevented || e.isComposing) return false;
    const k = eventToKey(e);
    if (!k) return false;
    if (editable(e.target) && !/^(Mod|Ctrl|Alt)\+|^F\d+$|\+F\d+$/.test(k)) return false;
    const id = keyMap().get(k)?.[0];
    if (!id) return false;
    e.preventDefault();
    runCommand(id);
    return true;
}

/** 전역 디스패처를 건다 — 앱이 한 번. 돌려준 함수로 뗀다. */
export function installKeybindings(): () => void {
    const h = (e: KeyboardEvent) => { handleKeydown(e); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
}
