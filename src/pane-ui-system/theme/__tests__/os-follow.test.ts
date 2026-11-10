// @vitest-environment jsdom
/**
 * OS 밝기 따라가기 — 2026-11-10 쥔님 겪음 「시스템에서 밝게/어둡게가 안 따라간다」.
 * 실제 OS 전환(osascript)으로 재현한 두 원인을 장치로 고정한다:
 *   ① import 시점 로드 → 접두사 전 키를 읽어 저장 모드 무시   ② 짝 없는 테마(Nord 등)가 mode 를 무시
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Listener = () => void;
let dark = false;
let listeners: Listener[] = [];
function installMatchMedia() {
    window.matchMedia = ((q: string) => ({
        get matches() { return q.includes('dark') ? dark : !dark; },
        media: q, addEventListener: (_: string, l: Listener) => { listeners.push(l); }, removeEventListener: () => {},
        addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}
function flipOs(toDark: boolean) { dark = toDark; for (const l of listeners) l(); }

async function boot(saved: unknown) {
    vi.resetModules();
    listeners = [];
    localStorage.clear();
    installMatchMedia();
    // main.tsx 와 같은 순서: 모듈 import 가 먼저 끝나고, 그 뒤에 접두사가 정해진다
    const { setStoragePrefix } = await import('../../storage');
    const mod = await import('../useTheme');
    const { applyTheme } = await import('../apply');
    setStoragePrefix('shiftgrid.v2');
    if (saved) localStorage.setItem('shiftgrid.v2.theme', JSON.stringify(saved));
    applyTheme(mod.getThemeSettings());
    return mod;
}

beforeEach(() => { dark = false; document.documentElement.dataset.theme = ''; });

describe('OS 밝기 따라가기', () => {
    it('빈 저장소 기본값은 system 이다', async () => {
        const m = await boot(null);
        expect(m.getThemeSettings().mode).toBe('system');
    });
    it('system 이면 OS 전환(change 이벤트)을 새로고침 없이 따른다', async () => {
        await boot(null);
        expect(document.documentElement.dataset.theme).toBe('light');
        flipOs(true);
        expect(document.documentElement.dataset.theme).toBe('dark');
        flipOs(false);
        expect(document.documentElement.dataset.theme).toBe('light');
    });
    it('저장된 「밝게」는 접두사 뒤에 읽혀 OS 가 바뀌어도 밝게를 지킨다', async () => {
        const m = await boot({ mode: 'light', density: 'cozy', theme: 'notion-light' });
        expect(m.getThemeSettings().mode).toBe('light');
        flipOs(true);
        expect(document.documentElement.dataset.theme).toBe('light');
    });
    it('system + 짝 없는 Nord 도 밝은 OS 에서는 밝아진다', async () => {
        await boot({ mode: 'system', density: 'cozy', theme: 'nord' });
        expect(document.documentElement.dataset.theme).toBe('light');
        flipOs(true);
        expect(document.documentElement.dataset.theme).toBe('dark');
    });
});
