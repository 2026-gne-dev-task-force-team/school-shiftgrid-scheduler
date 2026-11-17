// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { RoomManageView } from './RoomManage';
import { fakeRooms } from './fakeRooms.testkit';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

const btn = (el: HTMLElement) => [...el.querySelectorAll('button')].find((b) => b.textContent === '방 예약 열기');

describe('특별실 관리 화면 — 방 예약 길잡이(T-10fx)', () => {
    it('방 예약 약속이 있으면 「방 예약 열기」 단추가 보이고 누르면 cmd.book 을 부른다', async () => {
        const opened: string[] = [];
        const host = { modules: { use: (n: string) => (n === 'room-booking' ? { cmd: { book: 'rb-book' } } : null) }, commands: { run: (id: string) => { opened.push(id); } }, workspace: { open: () => undefined } } as unknown as PluginHost;
        const el = document.createElement('div');
        document.body.appendChild(el);
        await act(async () => createRoot(el).render(createElement(RoomManageView, { rooms: fakeRooms([]), host })));
        expect(btn(el)).toBeTruthy();
        await act(async () => { btn(el)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(opened).toEqual(['rb-book']);
    });
    it('방 예약 약속이 없으면 단추를 숨긴다', async () => {
        const host = { modules: { use: () => null }, commands: { run: () => undefined }, workspace: { open: () => undefined } } as unknown as PluginHost;
        const el = document.createElement('div');
        document.body.appendChild(el);
        await act(async () => createRoot(el).render(createElement(RoomManageView, { rooms: fakeRooms([]), host })));
        expect(btn(el)).toBeUndefined();
    });
});
