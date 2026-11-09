// @vitest-environment jsdom
/**
 * 전역 우클릭 가드 — 예외 자리(입력칸·본문 글) 밖에서는 브라우저 기본 메뉴가 막힌다(Q1·X2).
 * 🪲 가드를 안 걸거나 예외 셀렉터를 넓히면 아래가 빨강이다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { installContextMenuGuard } from './guards';

let off: (() => void) | null = null;
afterEach(() => { off?.(); off = null; document.body.innerHTML = ''; });

function rightClick(el: Element): boolean {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e.defaultPrevented;
}

describe('installContextMenuGuard', () => {
    it('일반 칸(달력 칸처럼 select-text 없는 곳)은 기본 메뉴를 막는다', () => {
        off = installContextMenuGuard();
        document.body.innerHTML = '<div id="cell"><span id="x">19</span></div>';
        expect(rightClick(document.getElementById('x')!)).toBe(true);
    });
    it('입력칸·본문 글(select-text)은 기본 메뉴를 그대로 둔다', () => {
        off = installContextMenuGuard();
        document.body.innerHTML = '<input id="i"><div class="select-text"><p id="p">글</p></div>';
        expect(rightClick(document.getElementById('i')!)).toBe(false);
        expect(rightClick(document.getElementById('p')!)).toBe(false);
    });
    it('걷으면(dispose) 더는 막지 않는다', () => {
        installContextMenuGuard()();
        document.body.innerHTML = '<div id="c">x</div>';
        expect(rightClick(document.getElementById('c')!)).toBe(false);
    });
});
