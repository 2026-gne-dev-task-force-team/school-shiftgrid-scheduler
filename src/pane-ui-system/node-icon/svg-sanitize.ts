/**
 * 아이콘 SVG 소독 — 플러그인이 낸 SVG 문자열을 그리기 전에 거른다.
 *   허용 목록 방식: 그림 요소만 · 어트리뷰트는 모양 관련만. script·foreignObject·on*·style·외부 href 는 전부 버린다.
 *   크기는 밖에서 정한다 — width·height 를 지우고 100% 로 맞춘다. 색은 currentColor 를 쓰는 SVG 가 글자색을 따른다.
 */
const ELEMENTS = new Set([
    'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
    'defs', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc', 'clippath', 'mask',
]);
const ATTRS = new Set([
    'viewbox', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'width', 'height',
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity', 'fill-opacity',
    'opacity', 'fill-rule', 'clip-rule', 'transform', 'offset', 'stop-color', 'stop-opacity', 'id', 'xmlns',
    'gradientunits', 'gradienttransform', 'clip-path', 'mask', 'preserveaspectratio',
]);
/** 값 안에서 바깥을 끌어오는 꼴(url(http…)·javascript:·data:) 거르기 — url(#id) 만 허용 */
function badValue(v: string): boolean {
    const t = v.toLowerCase().replace(/\s+/g, '');
    if (t.includes('javascript:') || t.includes('data:') || t.includes('expression(')) return true;
    const urls = t.match(/url\(([^)]*)\)/g) ?? [];
    return urls.some((u) => !/^url\(['"]?#/.test(u));
}

export function sanitizeSvg(src: string): string | null {
    if (typeof src !== 'string' || !src.trim() || typeof DOMParser === 'undefined') return null;
    const doc = new DOMParser().parseFromString(src, 'text/html');
    const root = doc.body.querySelector('svg');
    if (!root) return null;
    const clean = (el: Element): void => {
        for (const child of Array.from(el.children)) {
            if (!ELEMENTS.has(child.tagName.toLowerCase())) { child.remove(); continue; }
            clean(child);
        }
        for (const a of Array.from(el.attributes)) {
            const n = a.name.toLowerCase();
            if (!ATTRS.has(n) || badValue(a.value)) el.removeAttribute(a.name);
        }
    };
    clean(root);
    root.removeAttribute('width');
    root.removeAttribute('height');
    root.setAttribute('width', '100%');
    root.setAttribute('height', '100%');
    if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', '0 0 24 24');
    root.setAttribute('aria-hidden', 'true');
    return root.outerHTML;
}

/** 이미지 주소 거르기 — https · 같은 출처 상대 경로 · 그림 data: 만. javascript: · svg data: 는 막는다. */
export function safeImageUrl(url: string): string | null {
    const u = (url ?? '').trim();
    if (!u) return null;
    if (/^https:\/\//i.test(u)) return u;
    if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(u)) return u;
    if (/^(\/(?!\/)|\.\/|\.\.\/)[^:]*$/.test(u)) return u;
    return null;
}
