// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoPart, memoryRoomSource } from './book';
import { RoomView } from './RoomPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

const ctx = { viewer: { loggedIn: true, projectId: 'p1', userId: 'u-a', role: '교사' as const }, userName: '가짜갑', today: '2026-11-12', now: () => 'n', newId: () => 'new' };

describe('특별실 예약 화면', () => {
    it('빈 방 예약 → 내 예약에 뜨고 취소하면 사라진다', async () => {
        const src = memoryRoomSource(demoPart());
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(RoomView, { source: src, ctx, initial: { date: '2026-11-16', trackName: '1-1' } })));
        const click = async (label: string) => { await act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
        await click('운동장 예약');
        expect(host.textContent).toContain('예약했습니다');
        expect((await src.loadReservations('2026-11-16')).length).toBe(1);
        expect(host.textContent).toContain('내 예약 1건');
        await click('취소');
        expect((await src.loadReservations('2026-11-16')).length).toBe(0);
    });
});
