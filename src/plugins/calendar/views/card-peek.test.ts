/**
 * 카드 피크 조종기 — 「열렸다 / 교체됐다 / 닫혔다」 상태 전이. render(id)→문자열로 React 없이 검증한다.
 */
import { describe, it, expect, vi } from 'vitest';
import { makeCardPeek } from './card-peek';

describe('카드 피크 조종기', () => {
    it('open 은 그 일정 카드를 피크에 띄운다', () => {
        const show = vi.fn();
        const hide = vi.fn();
        const c = makeCardPeek({ show, hide }, (id) => `card:${id}`);
        c.open('a');
        expect(c.openId()).toBe('a');
        expect(show).toHaveBeenCalledTimes(1);
        expect(show).toHaveBeenCalledWith('card:a', { wideMin: 420 });
        expect(hide).not.toHaveBeenCalled();
    });

    it('다른 일정을 열면 새 창이 아니라 내용이 교체된다', () => {
        const show = vi.fn();
        const hide = vi.fn();
        const c = makeCardPeek({ show, hide }, (id) => `card:${id}`);
        c.open('a');
        c.open('b');
        expect(c.openId()).toBe('b');
        expect(show).toHaveBeenCalledTimes(2);        // show 를 다시 부른다(교체)
        expect(hide).not.toHaveBeenCalled();          // 사이에 닫지 않는다
        expect(show).toHaveBeenLastCalledWith('card:b', { wideMin: 420 });
    });

    it('close 는 닫고, 이미 닫혀 있으면 hide 를 다시 안 부른다', () => {
        const show = vi.fn();
        const hide = vi.fn();
        const c = makeCardPeek({ show, hide }, (id) => `card:${id}`);
        c.open('a');
        c.close();
        expect(c.openId()).toBeNull();
        expect(hide).toHaveBeenCalledTimes(1);
        c.close();
        expect(hide).toHaveBeenCalledTimes(1);        // 이미 닫혀 있으면 안 부른다
    });
});
