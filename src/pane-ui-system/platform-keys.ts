/**
 * 플랫폼 키 — 🔴 ⭐ 수정키 판정·표기의 **유일한 자리**(W14 · 쥔님 11-10 *"단축키 맥말고도 윈도우도 같이 해야해"*).
 *   Mod = 맥 ⌘(metaKey) / 그 밖 Ctrl(ctrlKey). ⛔ 다른 곳에서 metaKey 를 직접 읽지 말 것 — 윈도우에서 Win 키를 Mod 로 오인한다(ratchet.test 가 빨개진다).
 *   플랫폼 판정은 platform() 한 군데 — 테스트는 setPlatform('win'|'mac'|null) 로 바꿔 낀다.
 */
export type Platform = 'mac' | 'win';

let forced: Platform | null = null;
/** 테스트용 — null 이면 브라우저 값으로 되돌린다. */
export function setPlatform(p: Platform | null): void { forced = p; }

export function platform(): Platform {
    if (forced) return forced;
    if (typeof navigator === 'undefined') return 'win';
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const s = nav.userAgentData?.platform || nav.platform || nav.userAgent || '';
    return /Mac|iPhone|iPad/i.test(s) ? 'mac' : 'win';
}
export const isMacPlatform = (): boolean => platform() === 'mac';

type ModEvent = { metaKey: boolean; ctrlKey: boolean };
/** Mod 키가 눌렸나 — 맥 ⌘ / 그 밖 Ctrl. */
export function isMod(e: ModEvent, mac: boolean = isMacPlatform()): boolean { return mac ? e.metaKey : e.ctrlKey; }
/** Alt(맥 ⌥) 가 눌렸나. */
export function isAlt(e: { altKey: boolean }): boolean { return e.altKey; }

/** 보여 줄 글자 — 'Mod+Shift+Z' → 맥 「⌘⇧Z」 · 윈도우 「Ctrl+Shift+Z」. */
export function keyLabel(k: string, mac: boolean = isMacPlatform()): string {
    if (!k) return '';
    if (!mac) return k.replace(/\bMod\b/, 'Ctrl');
    const sym: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' };
    return k.split('+').map((p) => sym[p] ?? p).join('');
}
/** 「⌘클릭」 / 「Ctrl+클릭」 */
export const modClickLabel = (mac: boolean = isMacPlatform()): string => (mac ? '⌘클릭' : 'Ctrl+클릭');
