// @vitest-environment jsdom
/**
 * T-10gl 회귀 — 리본 「방 예약」 → 달력 탭이 `"calendar" 가 선언 안 한 인터페이스 "rooms" 를 use 한다` 로 죽던 것.
 *   달력은 프리셋 banner 를 **달력 자기 host** 로 그린다. 옛 banner 는 받은 host 로 rooms 를 use → 달력이 안 적은 약속이라 던졌다.
 *   🔴 가짜 host 가 아니라 진짜 레지스트리(activateAll)·진짜 makeHost·진짜 manifest 선언 검사로 잰다(room-booking-view.test 의 가짜 host 는 이 회귀를 못 잡았다).
 *   ⛔ 실명 없음 — 지어낸 이름만.
 */
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activateAll, makeHost, type PluginModule } from '../../pane-ui-system/plugin';
import { calendarPlugin } from '../calendar/index';
import { roomBookingPlugin, ROOM_BOOKING_PRESET } from './index';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function provider(id: string, iface: string, mod: unknown, version = '0.1.0'): PluginModule {
    return { manifest: { id, name: id, version: '0.1.0', minHostVersion: '0.1.0', provides: { [iface]: version } }, modules: { [iface]: mod } } as PluginModule;
}
const emptyRooms = {
    version: 1, lists: () => [{ id: 'l', name: '가상 방 목록' }], roomsIn: () => [], room: () => undefined,
    roomProps: () => ({ active: true }), onChange: () => ({ dispose() {} }),
};
const fakeNodes = { liveByType: () => [], get: () => undefined, subscribe: () => ({ dispose() {} }), registerContributed: () => ({ dispose() {} }) };

let root: Root | null = null;
let el: HTMLDivElement;
beforeEach(() => {
    // 진짜 달력 꾸러미 + 진짜 방 예약 꾸러미 — rooms·nodes 만 가짜 제공자
    activateAll([provider('t10gl-nodes', 'nodes', fakeNodes), provider('t10gl-rooms', 'rooms', emptyRooms), calendarPlugin, roomBookingPlugin]);
    el = document.createElement('div');
    document.body.appendChild(el);
});
afterEach(() => { act(() => root?.unmount()); root = null; el.remove(); });

describe('달력이 자기 host 로 그린 방 예약 띠', () => {
    it('증거 — 달력 host 는 rooms 를 선언하지 않아 use 하면 던진다', () => {
        const calHost = makeHost(calendarPlugin.manifest.id, undefined, calendarPlugin.manifest);
        expect(() => calHost.modules.use('rooms')).toThrow(/선언 안 한 인터페이스/);
    });
    it('달력 host 를 받아도 던지지 않고 방 0개 안내가 그려진다', () => {
        const calHost = makeHost(calendarPlugin.manifest.id, undefined, calendarPlugin.manifest);
        const Banner = ROOM_BOOKING_PRESET.banner!;
        root = createRoot(el);
        expect(() => act(() => root!.render(h(Banner, { host: calHost })))).not.toThrow();
        expect(el.querySelector('[data-room-empty-banner]')?.textContent).toContain('특별실 관리에서 방을 먼저 더해 주세요');
    });
});
