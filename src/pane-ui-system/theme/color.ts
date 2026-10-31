/**
 * 색 변환 — "r g b" 세 수(토큰 값의 꼴)와 "#rrggbb"(브라우저 color 입력) 사이를 오간다.
 *
 * 🔴 ⭐ 이 파일을 theme/ 에 두는 이유는 themeSwatchStyle 과 같다 — features/ 쪽은 하드코딩 색 검사가
 *    "#..." · "rgb(" 글자를 막는다. 색을 다루는 글자는 검사 밖(theme/)에 모으고, 화면은 이 함수만 부른다.
 * ⛔ 도메인은 모른다(구조 검사 ⑤).
 */

/** "r g b"(0~255 세 수) 인가 — 토큰 값·가져온 색의 받아들이기용 */
export function isTriplet(v: unknown): v is string {
    if (typeof v !== 'string') return false;
    const m = v.trim().match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/);
    if (!m) return false;
    return m.slice(1).every((n) => Number(n) <= 255);
}

function clampByte(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

/** "r g b" → "#rrggbb"(소문자). 모양이 틀리면 검정으로 떨어뜨린다(화면이 안 깨지게) */
export function rgbToHex(triplet: string): string {
    const m = String(triplet).trim().match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/);
    const [r, g, b] = m ? m.slice(1).map((n) => clampByte(Number(n))) : [0, 0, 0];
    const h = (n: number) => n.toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}

/** "#rgb"·"#rrggbb" → "r g b". 못 읽으면 null */
export function hexToRgb(hex: string): string | null {
    const s = String(hex).trim().replace(/^#/, '');
    let r: number; let g: number; let b: number;
    if (/^[0-9a-fA-F]{3}$/.test(s)) {
        r = parseInt(s[0] + s[0], 16); g = parseInt(s[1] + s[1], 16); b = parseInt(s[2] + s[2], 16);
    } else if (/^[0-9a-fA-F]{6}$/.test(s)) {
        r = parseInt(s.slice(0, 2), 16); g = parseInt(s.slice(2, 4), 16); b = parseInt(s.slice(4, 6), 16);
    } else {
        return null;
    }
    return `${r} ${g} ${b}`;
}
