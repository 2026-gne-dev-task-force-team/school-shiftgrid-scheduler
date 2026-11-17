// @vitest-environment jsdom
/**
 * 앱 껍데기 화면 결함(T-10ag 화면 훑기 → T-10ak) — jsdom 으로 잴 수 있는 만큼 Workbench 를 통째로 띄워 잰다.
 *   ① 리본이 창보다 길 때 문서가 밀리지 않게 — 리본은 제 안에서 스크롤, 뿌리·가운데 줄은 프로그램 스크롤도 안 받는다(overflow:clip).
 *      ⚠️ 실제 높이·밀림은 jsdom 이 못 잰다 — 클래스만 잰다(화면 재검 필요).
 *   ② 창 크기만 바꿔도 넓은/좁은 판이 따라간다 — matchMedia change 가 안 와도 resize 로 다시 잰다.
 *   ③ 리본 강조는 지금 열린 패널을 따른다.
 *   ④ ⌘K·Ctrl+K 로 명령 팔레트가 뜬다.
 *   ⑤ 리본 「자동 편성」을 누르면 가운데에 탭이 선다(U20 F12 판 1 — 옛 iframe 편성기를 내려 표본을 바꿨다).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activateAll } from '../pane-ui-system/plugin';
import { setPlatform } from '../pane-ui-system/platform-keys';
import { PLUGINS } from './plugins';
import { Workbench } from './Workbench';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 가짜 창 폭 — change 이벤트를 쏘는지(fire)는 고를 수 있다(안 쏘는 브라우저·자동화 도구 흉내) */
let width = 1280;
let subs = new Set<(e: { matches: boolean }) => void>();
function installScreen() {
    window.matchMedia = ((query: string) => {
        const m = /max-width:\s*(\d+)px/.exec(query);
        const q = m ? Number(m[1]) : Infinity;
        return {
            get matches() { return m ? width <= q : false; },
            media: query,
            addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => subs.add(fn),
            removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => subs.delete(fn),
        };
    }) as unknown as typeof window.matchMedia;
}

// jsdom 에는 scrollIntoView 가 없다 — 부른 횟수만 센다(① 창틀이 조상을 굴리는 길을 쓰지 않는지)
let scrollIntoViewCalls = 0;
beforeAll(() => {
    Element.prototype.scrollIntoView = function () { scrollIntoViewCalls++; };
    // 뷰(달력 등)가 ResizeObserver 를 쓴다 — jsdom 엔 없다
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    installScreen();
    activateAll(PLUGINS);
});

let root: Root | null = null;
let host: HTMLDivElement;
function mount() {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => { root!.render(<Workbench />); });
}
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    localStorage.clear();
    width = 1280;
    subs = new Set();
});

const ribbonBtn = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('nav button[data-row-id]')].find((b) => b.getAttribute('aria-label')?.startsWith(label));
const rail = () => host.querySelector<HTMLElement>('nav.w-rail');
const palette = () => document.querySelector('[role="dialog"][aria-label="명령 팔레트"]');
const press = (init: KeyboardEventInit) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init })); });

describe('① 리본이 창보다 길어도 문서가 밀리지 않는다', () => {
    it('리본은 제 안에서 세로 스크롤 · 뿌리와 가운데 줄은 overflow:clip', () => {
        mount();
        const nav = rail()!;
        expect(nav.className).toMatch(/\boverflow-y-auto\b/);
        expect(nav.className).toMatch(/\bmin-h-0\b/);
        const rootEl = host.firstElementChild as HTMLElement;
        expect(rootEl.className).toMatch(/\boverflow-clip\b/);
        expect((nav.parentElement as HTMLElement).className).toMatch(/\boverflow-clip\b/);
    });
    it('탭을 바꿔도 scrollIntoView 를 안 부른다(조상까지 굴려 화면을 민다)', () => {
        mount();
        // 탭 둘을 연 뒤 이미 선 탭으로 돌아간다 — 탭 줄이 활성 탭을 끌어오는 길을 탄다
        act(() => { ribbonBtn('자동 편성')!.click(); });
        act(() => { ribbonBtn('달력')!.click(); });
        scrollIntoViewCalls = 0;
        act(() => { ribbonBtn('자동 편성')!.click(); });
        expect(host.querySelector('#main-content [data-pane-active="timetable-solver.auto"]')).not.toBeNull();
        expect(scrollIntoViewCalls).toBe(0);
    });
});

describe('② 창 크기만 바꿔도 넓은/좁은 판이 따라간다', () => {
    it('matchMedia change 가 안 와도 resize 로 좁은 판(리본 없음)으로 간다', () => {
        mount();
        expect(rail()).not.toBeNull();
        width = 390;
        act(() => { window.dispatchEvent(new Event('resize')); });   // change 는 일부러 안 쏜다
        expect(rail()).toBeNull();
        width = 1280;
        act(() => { window.dispatchEvent(new Event('resize')); });
        expect(rail()).not.toBeNull();
    });
});

describe('③ 리본 강조는 지금 열린 패널을 따른다', () => {
    it('누른 리본만 aria-current — 다른 리본을 누르면 강조가 옮겨 간다', () => {
        mount();
        const btns = [...host.querySelectorAll<HTMLButtonElement>('nav button[data-row-id]')];
        expect(btns.length).toBeGreaterThan(1);
        const opened = btns.filter((b) => {
            act(() => { b.click(); });
            return host.querySelectorAll('nav [aria-current="page"]').length === 1
                && host.querySelector('nav [aria-current="page"]') === b;
        });
        // 뷰를 여는 리본은 눌린 그 단추가 강조된다(동작만 하는 리본은 안 켜질 수 있다)
        expect(opened.length).toBeGreaterThan(1);
        const [a, b] = opened;
        act(() => { a.click(); });
        expect(a.getAttribute('aria-current')).toBe('page');
        expect(b.getAttribute('aria-current')).toBeNull();
        act(() => { b.click(); });
        expect(b.getAttribute('aria-current')).toBe('page');
        expect(a.getAttribute('aria-current')).toBeNull();
    });
});

describe('④ ⌘K·Ctrl+K 로 명령 팔레트', () => {
    it('맥 ⌘K', () => {
        setPlatform('mac');
        mount();
        expect(palette()).toBeNull();
        press({ key: 'k', code: 'KeyK', metaKey: true });
        expect(palette()).not.toBeNull();
    });
    it('맥 Ctrl+K 도 같은 팔레트', () => {
        setPlatform('mac');
        mount();
        press({ key: 'k', code: 'KeyK', ctrlKey: true });
        expect(palette()).not.toBeNull();
    });
    it('윈도우 Ctrl+K', () => {
        setPlatform('win');
        mount();
        press({ key: 'k', code: 'KeyK', ctrlKey: true });
        expect(palette()).not.toBeNull();
    });
});

describe('⑤ 리본 「자동 편성」 → 가운데에 탭', () => {
    it('누르면 자동 편성 탭이 가운데에 서고 활성이다', () => {
        mount();
        const b = ribbonBtn('자동 편성');
        expect(b).toBeTruthy();
        act(() => { b!.click(); });
        // 가운데 탭 줄에 그 탭이 서고 활성이다
        expect(host.querySelector('#main-content [data-tabbar] [data-row-id="timetable-solver.auto"]')).not.toBeNull();
        expect(host.querySelector('#main-content [data-pane-active="timetable-solver.auto"]')).not.toBeNull();
    });
});

describe('⑥ 1280→390 창 줄이기 — 첫 그림부터 좁은 판(T-10ao 05 반쪽 화면)', () => {
    // 붙박이 패널(aside)·덮는 서랍(fixed inset-0)이 남아 있으면 탐색기·본문·속성이 겹친다
    const asides = () => host.querySelectorAll('aside').length;
    const drawers = () => host.querySelectorAll('.fixed.inset-0').length;
    it('줄인 바로 그 그림에 붙박이 패널도, 미끄러져 나가는 서랍도 없다 · 늘리면 붙박이로 돌아온다', () => {
        mount();
        act(() => { ribbonBtn('자동 편성')!.click(); });
        expect(asides()).toBe(2);
        width = 390;
        act(() => { window.dispatchEvent(new Event('resize')); });   // 타이머를 기다리지 않는다(숨은 탭에선 안 돈다)
        expect(rail()).toBeNull();
        expect(asides()).toBe(0);
        expect(drawers()).toBe(0);
        width = 1280;
        act(() => { window.dispatchEvent(new Event('resize')); });
        expect(rail()).not.toBeNull();
        const open = [...host.querySelectorAll<HTMLElement>('aside')].filter((a) => a.style.width !== '0px');
        expect(open.length).toBe(2);
        expect(drawers()).toBe(0);
    });
});

describe('⑦ 탭이 많을 때 새 탭을 탭 줄 안으로 끌어온다(T-10ao 02)', () => {
    // jsdom 은 배치를 안 한다 — 탭 줄은 0~600px, 탭은 차례대로 150px 씩이라고 흉내 낸다(scrollLeft 만큼 왼쪽으로 밀린다)
    const TAB = 150, STRIP = 600;
    const restore: (() => void)[] = [];
    beforeEach(() => {
        const rect = Element.prototype.getBoundingClientRect;
        const sl = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
        const store = new WeakMap<Element, number>();
        Object.defineProperty(Element.prototype, 'scrollLeft', {
            configurable: true,
            get(this: Element) { return store.get(this) ?? 0; },
            set(this: Element, v: number) { store.set(this, Math.max(0, v)); },
        });
        Element.prototype.getBoundingClientRect = function (this: Element) {
            const strip = this.closest('[data-tabbar]') as HTMLElement | null;
            const box = (l: number, w: number) => ({ left: l, right: l + w, width: w, top: 0, bottom: 30, height: 30, x: l, y: 0, toJSON() {} }) as DOMRect;
            if (this.hasAttribute('data-tabbar')) return box(0, STRIP);
            if (strip && this.hasAttribute('data-row-id')) {
                const i = [...strip.querySelectorAll('[data-row-id]')].indexOf(this);
                return box(i * TAB - strip.scrollLeft, TAB);
            }
            return rect.call(this);
        };
        restore.push(() => {
            Element.prototype.getBoundingClientRect = rect;
            if (sl) Object.defineProperty(Element.prototype, 'scrollLeft', sl);
            else delete (Element.prototype as { scrollLeft?: number }).scrollLeft;
        });
    });
    afterEach(() => { while (restore.length) restore.pop()!(); });

    it('탭 여럿 뒤 리본으로 새 탭 → 탭 줄 보이는 자리로 끌어온다', () => {
        localStorage.clear(); sessionStorage.clear();   // 앞 시험의 배치(세션 저장소에도 둔다)가 남으면 「새 탭」이 안 선다
        mount();
        for (const l of ['달력', '데이터 검사', '근태', '학사', '보결 명단', '시트', '일과표', '노트', '과목', '보결 목록', '특별실 예약']) {
            act(() => { ribbonBtn(l)?.click(); });
        }
        const strip = host.querySelector<HTMLElement>('#main-content [data-tabbar]')!;
        const rows = () => [...strip.querySelectorAll<HTMLElement>('[data-row-id]')];
        expect(rows().length).toBeGreaterThan(STRIP / TAB);
        // 끝 탭을 고른 뒤(새 탭은 활성 탭 바로 뒤에 선다) 사람이 탭 줄을 맨 앞으로 되감아 둔다 — 새 탭이 줄 밖에 서는 판
        act(() => { rows().at(-1)!.click(); });
        strip.scrollLeft = 0;
        // ⚠️ 아직 안 연 리본(시수표 · T-30d 로 컬렉션은 기본 숨김)으로 「새 탭」을 세운다
        const before = new Set(rows());
        act(() => { ribbonBtn('시수표')!.click(); });
        const tab = rows().find((e) => !before.has(e))!;
        expect(tab).toBeTruthy();
        expect(rows().indexOf(tab)).toBeGreaterThanOrEqual(STRIP / TAB);   // 정말 줄 밖에 선 탭이다
        const r = tab.getBoundingClientRect();
        expect(r.left).toBeGreaterThanOrEqual(0);
        expect(r.right).toBeLessThanOrEqual(STRIP);
    });
});
