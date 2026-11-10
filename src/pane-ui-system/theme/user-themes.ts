/**
 * 사용자 테마 — 이름 붙여 저장한 색 한 벌. 기기별 localStorage(storageKey('themes')).
 *
 * 🔴 ⛔ 기기별이다 — ⛔ 프로젝트 파일·계정에 안 넣는다(쥔님 갈림 6: "테마 저장은 기기별"). 테마는 화면의 성질이다.
 * 🔴 ⭐ 한 벌의 모양은 { id, name, base, colors } — base 는 "어느 내장 프리셋 위에 얹나"(밝기 짝 정보),
 *    colors 는 그 위에 덮는 토큰들. 적용은 기존 길 하나(settings.theme=base + settings.custom=colors)로 간다.
 * 🔴 가져오기(JSON)는 panels·settings 와 같은 태도 — 모양 틀린 "그 칸만" 버린다. 몇 개 버렸는지(skipped) 알려 준다.
 *    ⛔ 평문 그 외 아무것도 안 들인다 — name·base·colors 밖의 키는 통째로 버린다(남의 데이터가 섞여 들어오지 않게).
 */
import { useSyncExternalStore } from 'react';
import { COLOR_TOKENS, THEMES, DEFAULT_THEME_ID, type ColorToken } from './tokens';
import { isTriplet } from './color';
import { storageKey } from '../storage';
import { reportSettingsSaveFail } from '../layout/save-fail';
import { onStorageKey } from '../cross-tab';

export interface UserTheme {
    /** 기기 로컬 식별자 — 저장할 때 부여 */
    id: string;
    name: string;
    /** 어느 내장 프리셋 위에 얹나(밝기 짝 정보). 모르는 id 면 기본 테마 */
    base: string;
    /** 덮는 색 토큰들 — 아는 토큰·성한 "r g b" 만 */
    colors: Partial<Record<ColorToken, string>>;
}

export const themesKey = () => storageKey('themes');

function knownBase(v: unknown): string {
    return typeof v === 'string' && THEMES.some((t) => t.id === v) ? v : DEFAULT_THEME_ID;
}

/** colors 객체에서 아는 토큰 + 성한 값만 추린다. 버린 칸 수(skipped)도 센다 */
function pickColors(raw: unknown): { colors: Partial<Record<ColorToken, string>>; skipped: number } {
    const out: Partial<Record<ColorToken, string>> = {};
    let skipped = 0;
    if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        for (const [k, v] of Object.entries(o)) {
            if ((COLOR_TOKENS as readonly string[]).includes(k) && isTriplet(v)) {
                out[k as ColorToken] = v as string;
            } else {
                skipped += 1;   // 모르는 토큰 이름이거나 "r g b" 꼴이 아닌 값
            }
        }
    }
    return { colors: out, skipped };
}

let seq = 0;
function freshId(): string {
    seq += 1;
    return `ut-${Date.now().toString(36)}-${seq}`;
}

/** 저장된 한 벌을 성한 꼴로 — 못 쓰면 null */
export function normalizeUserTheme(raw: unknown): UserTheme | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : null;
    if (!name) return null;
    const id = typeof o.id === 'string' && o.id ? o.id : freshId();
    return { id, name, base: knownBase(o.base), colors: pickColors(o.colors).colors };
}

export function normalizeUserThemes(raw: unknown): UserTheme[] {
    if (!Array.isArray(raw)) return [];
    const out: UserTheme[] = [];
    for (const x of raw) {
        const t = normalizeUserTheme(x);
        if (t) out.push(t);
    }
    return out;
}

// ─────────────────────────── 가져오기/내보내기 ───────────────────────────

/** 내보낼 JSON 글자 — { name, base, colors } 만(평문 그 외 없음) */
export function exportThemeJSON(t: Pick<UserTheme, 'name' | 'base' | 'colors'>): string {
    return JSON.stringify({ name: t.name, base: t.base, colors: t.colors }, null, 2);
}

export interface ImportResult {
    theme: UserTheme | null;
    skipped: number;
    error?: string;
}

/**
 * 파일 글자 → 사용자 테마 한 벌. 🔴 틀린 색 칸은 버리고 몇 개 버렸는지 센다.
 *   ⛔ name·base·colors 밖의 키는 들이지 않는다.
 */
export function importThemeJSON(text: string): ImportResult {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return { theme: null, skipped: 0, error: 'JSON 을 읽지 못했습니다' }; }
    if (!raw || typeof raw !== 'object') return { theme: null, skipped: 0, error: '테마 모양이 아닙니다' };
    const o = raw as Record<string, unknown>;
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : '가져온 테마';
    const { colors, skipped } = pickColors(o.colors);
    return { theme: { id: freshId(), name, base: knownBase(o.base), colors }, skipped };
}

// ─────────────────────────── 보관 + 외부 스토어 ───────────────────────────

function load(): UserTheme[] {
    try {
        if (typeof localStorage === 'undefined') return [];
        const s = localStorage.getItem(themesKey());
        return s ? normalizeUserThemes(JSON.parse(s)) : [];
    } catch { return []; }
}
function save(list: UserTheme[]): void {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(themesKey(), JSON.stringify(list)); } catch (e) { reportSettingsSaveFail('사용자 테마', e); }
}

let store: UserTheme[] | null = null;
const listeners = new Set<() => void>();
function ensure(): UserTheme[] { if (!store) store = load(); return store; }
function emit(): void { for (const l of listeners) l(); }
function commit(list: UserTheme[]): void { store = list; save(list); emit(); }
// 🔴 R3-X — 다른 탭이 사용자 테마를 바꾸면 다시 읽는다
onStorageKey(themesKey, () => { store = load(); emit(); });

/** 새 한 벌을 더한다(이름은 이미 정해진 채) — 부여된 id 를 돌려준다 */
export function addUserTheme(t: Omit<UserTheme, 'id'>): string {
    const theme: UserTheme = { ...t, id: freshId() };
    commit([...ensure(), theme]);
    return theme.id;
}
export function removeUserTheme(id: string): void {
    commit(ensure().filter((t) => t.id !== id));
}
/** 지운 테마를 원래 자리에 되살린다(되돌리기용). 이미 같은 id 가 있으면 건드리지 않는다. */
export function restoreUserTheme(t: UserTheme, index: number): void {
    const cur = ensure();
    if (cur.some((x) => x.id === t.id)) return;
    const next = [...cur];
    next.splice(Math.min(Math.max(index, 0), next.length), 0, t);
    commit(next);
}
export function renameUserTheme(id: string, name: string): void {
    const n = name.trim();
    if (!n) return;
    commit(ensure().map((t) => (t.id === id ? { ...t, name: n } : t)));
}

/** 테스트용 — 지금 보관된 사용자 테마 */
export function getUserThemesForTest(): UserTheme[] { return ensure(); }

export function useUserThemes(): UserTheme[] {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        ensure,
        ensure,
    );
}
