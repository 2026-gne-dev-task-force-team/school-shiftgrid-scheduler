// @vitest-environment jsdom
/**
 * 방 속성 화면 — 정원 고치기는 rooms 약속(setRoomProps)으로 가고, 고정 사용·차단 시간은 ext 에서 읽어 보인다.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Room, Rooms } from '../rooms/contracts/rooms';
import { RoomPropsView } from './RoomPropsView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = { id: 'r1', listId: 'l1', name: '가상 별채', ext: { 'room-booking': {
    fixed: [{ dayIndex: 0, startMin: 600, endMin: 660, label: '가상 동아리' }],
    blocks: [{ startDate: '2026-11-17', endDate: '2026-11-18', fromMin: null, toMin: null, reason: '바닥 공사' }],
} } };
let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });

function show(rooms: Rooms | null): HTMLElement {
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el);
    act(() => { root!.render(<RoomPropsView host={{ modules: { use: () => rooms } } as unknown as PluginHost} />); });
    return el;
}

describe('RoomPropsView', () => {
    it('고정 사용·차단 시간을 보이고 정원을 고치면 setRoomProps 로 간다', () => {
        const setRoomProps = vi.fn();
        const rooms = {
            lists: () => [{ id: 'l1', name: '목록' }], roomsIn: () => [room], roomProps: () => ({ active: true, capacity: 5 }), setRoomProps,
            onChange: () => ({ dispose() { /* 없음 */ } }),
        } as unknown as Rooms;
        const el = show(rooms);
        expect(el.querySelector('[data-room-fixed]')!.textContent).toBe('월 10:00~11:00 가상 동아리');
        expect(el.querySelector('[data-room-blocks]')!.textContent).toContain('바닥 공사');
        const input = [...el.querySelectorAll('input')].find((i) => i.value === '5')!;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => { set.call(input, '8'); input.dispatchEvent(new Event('input', { bubbles: true })); });
        expect(setRoomProps).toHaveBeenCalledWith('r1', { capacity: 8 });
    });

    it('방이 없으면 안내 글이 보인다', () => {
        const rooms = { lists: () => [], roomsIn: () => [], onChange: () => ({ dispose() { /* 없음 */ } }) } as unknown as Rooms;
        expect(show(rooms).querySelector('[data-room-empty]')).not.toBeNull();
    });
});
