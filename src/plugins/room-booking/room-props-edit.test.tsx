// @vitest-environment jsdom
/**
 * 방 속성 쓰기 한 줄 — 화면에서 고정 사용·차단 시간을 고치면 rooms 의 ext['room-booking'] 에 써지고, 방 예약 규칙이 그 값으로 거절한다.
 *   진짜 rooms 약속(roomsApi)·진짜 노드 저장소를 쓴다. ⛔ 실명 금지 — 지어낸 방 이름만.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (batch: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (batch.clear) store.clear();
        for (const v of batch.put ?? []) store.set(v.id as string, v);
        for (const id of batch.del ?? []) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore } from '../../pane-ui-system/core/node-store/store';
import { __resetPersistForTest } from '../../pane-ui-system/core/node-store/persist';
import { makeNodesApi } from '../../pane-ui-system/core/node-frame/api';
import { registerType, clearTypes } from '../../pane-ui-system/core/nodes/model/types';
import { clearDerived } from '../../pane-ui-system/core/nodes/model/derive';
import { defineCollection } from '../collection/define';
import { roomsNodeTypes, roomsNodeTypeImpl, LIST_TYPE, getKit, setKit, setNodes } from '../rooms/nodes';
import { ROOM_CONFIG } from '../rooms/config';
import { roomsApi } from '../rooms/api';
import { RoomPropsView } from './RoomPropsView';
import { judgeBooking, readRuleCells } from './rules';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

let root: Root | null = null;
let roomId = '';
beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('rooms');
    for (const nt of roomsNodeTypes) api.registerContributed(nt, { nodeTypes: roomsNodeTypeImpl }, host());
    setKit(defineCollection(ROOM_CONFIG));
    getKit()!.init(api);
    setNodes(api);
    const lid = api.create(api.roots.main, { type: LIST_TYPE, name: '가상 목록' });
    roomId = roomsApi.addRoom(lid, { name: '가상 별채' });
});
afterEach(() => {
    act(() => { root?.unmount(); }); root = null; document.body.innerHTML = '';
    getKit()?.init(null); setKit(null); setNodes(null); __resetPersistForTest();
});

function show(): HTMLElement {
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el);
    act(() => { root!.render(<RoomPropsView host={{ modules: { use: () => roomsApi } } as unknown as PluginHost} />); });
    return el;
}
const click = (b: Element) => act(() => { (b as HTMLElement).click(); });
function pick(sel: HTMLSelectElement, v: string) {
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    act(() => { set.call(sel, v); sel.dispatchEvent(new Event('change', { bubbles: true })); });
}
const byLabel = (el: HTMLElement, label: string) => el.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement;
const draft = (start: string, end: string) => ({ start, end, allDay: false, values: {} });

describe('방 속성 쓰기 — 화면 → rooms ext → 규칙', () => {
    it('고정 사용을 화면에서 더하고 고치면 ext 에 써지고, 그 시간 예약은 거절된다', () => {
        const el = show();
        expect(readRuleCells(roomsApi.room(roomId)!, roomId).fixed).toEqual([]);
        click(el.querySelector('[data-fixed-add]')!);                 // 월 09:00~10:00
        pick(byLabel(el, '요일'), '1');                                // 화요일로
        expect(roomsApi.room(roomId)!.ext?.['room-booking']).toEqual({ fixed: [{ dayIndex: 1, startMin: 540, endMin: 600, label: '' }] });
        const room = roomsApi.room(roomId)!;
        // 2026-11-17 은 화요일
        expect(judgeBooking(room, roomsApi.roomProps(roomId), draft('2026-11-17T09:00', '2026-11-17T09:30'))).toContain('고정');
        expect(judgeBooking(room, roomsApi.roomProps(roomId), draft('2026-11-17T10:00', '2026-11-17T11:00'))).toBeNull();
    });

    it('차단 시간을 화면에서 더하면 그 날 예약이 거절되고, 빼면 풀린다', () => {
        const el = show();
        click(el.querySelector('[data-block-add]')!);                  // 오늘 종일
        const b = readRuleCells(roomsApi.room(roomId)!, roomId).blocks;
        expect(b).toHaveLength(1);
        const day = b[0].startDate;
        expect(judgeBooking(roomsApi.room(roomId)!, roomsApi.roomProps(roomId), draft(`${day}T09:00`, `${day}T10:00`))).toContain('막혀');
        const del = [...el.querySelectorAll('[data-block-row] button')].find((x) => x.textContent === '빼기')!;
        click(del);
        expect(readRuleCells(roomsApi.room(roomId)!, roomId).blocks).toEqual([]);
        expect(judgeBooking(roomsApi.room(roomId)!, roomsApi.roomProps(roomId), draft(`${day}T09:00`, `${day}T10:00`))).toBeNull();
    });
});
