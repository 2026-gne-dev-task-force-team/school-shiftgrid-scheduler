// @vitest-environment jsdom
/** 알림 패널 — 기록 전부 · 꾸러미별 거르기 · 비우기 · 열려 있으면 읽음. */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotifyPanel } from './NotifyPanel';
import { notify, getNotifications, __resetNotifyForTest } from '../../plugin/notify';
import { resetPaneSettings } from '../../layout/pane-settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => { localStorage.clear(); resetPaneSettings(); __resetNotifyForTest(); });
afterEach(() => { document.body.innerHTML = ''; });

function mount() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => createRoot(host).render(createElement(NotifyPanel)));
    return host;
}
const btn = (h: HTMLElement, text: string) => [...h.querySelectorAll('button')].find((b) => b.textContent === text)!;

describe('NotifyPanel', () => {
    it('기록을 최신순으로 다 보이고, 열면 읽음 처리된다', () => {
        notify('a', { title: '첫째' }); notify('b', { title: '둘째' });
        const h = mount();
        expect(h.textContent).toContain('전체 2건');   // 머리는 전체 수(배지는 안 읽음 수 — S8)
        expect(h.querySelector('li')!.textContent).toContain('둘째');
        expect(getNotifications().unread).toBe(0);
    });

    it('꾸러미 칩을 누르면 그 꾸러미 것만 보인다 · 전체로 돌아온다', () => {
        notify('a', { title: '에이' }); notify('b', { title: '비' });
        const h = mount();
        act(() => btn(h, 'a').click());
        expect(h.querySelectorAll('li')).toHaveLength(1);
        expect(h.textContent).toContain('에이');
        act(() => btn(h, '전체').click());
        expect(h.querySelectorAll('li')).toHaveLength(2);
    });

    it('🔴 낡은 단추(새로 고침 뒤)는 회색 + 까닭 한 줄(C1)', () => {
        notify('a', { title: '지움', action: { label: '되돌리기', commandId: 'x.undo', args: { undoTop: 1 } } });
        __resetNotifyForTest();
        const h = mount();
        expect(btn(h, '되돌리기').disabled).toBe(true);
        expect(h.textContent).toContain('새로 고친 뒤라 쓸 수 없습니다');
    });

    it('비우기는 기록을 지운다', () => {
        notify('a', { title: '하나' });
        const h = mount();
        act(() => btn(h, '모두 지우기').click());
        expect(h.textContent).toContain('알림이 없습니다');
        expect(getNotifications().items).toHaveLength(0);
    });
});
