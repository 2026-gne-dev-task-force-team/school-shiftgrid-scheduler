/**
 * 링크 변종(url·email·phone) — 글자 그대로 저장하되 「형식이 맞나」와 「누르면 어디로 가나(href)」를 정한다(순수).
 *   형식이 틀리면 셀이 ⚠ 를 보이고(열기 단추 없음), 맞으면 href 로 연다.
 */
export type LinkKind = 'url' | 'email' | 'phone';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+]?[\d][\d\s()-]{2,}$/;

export function isValidLink(kind: LinkKind, raw: string): boolean {
    const s = raw.trim();
    if (s === '') return false;
    if (kind === 'email') return EMAIL.test(s);
    if (kind === 'phone') return PHONE.test(s);
    // url — scheme 이 있으면 그걸로, 없으면 점 있는 도메인 꼴이면 http 를 붙여 연다
    try { new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`); return /\./.test(s); } catch { return false; }
}

/** 누르면 갈 주소 — url 은 scheme 보강 · email 은 mailto · phone 은 tel(공백 제거) */
export function hrefOf(kind: LinkKind, raw: string): string {
    const s = raw.trim();
    if (kind === 'email') return `mailto:${s}`;
    if (kind === 'phone') return `tel:${s.replace(/[\s()-]/g, '')}`;
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
}
