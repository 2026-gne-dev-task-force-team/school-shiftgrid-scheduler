// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { RoomManagePanel, RoomManageView } from './RoomManage';
import { fixedOf } from './ops';
import { fakeRooms } from './fakeRooms.testkit';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

const mount = async (props: Parameters<typeof RoomManageView>[0]) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(createElement(RoomManageView, props)));
    return host;
};
const click = async (host: HTMLElement, label: string) => { await act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(async () => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
};
const seed = () => fakeRooms([{ id: 'r-sci', name: '가상 과학실', props: { capacity: 4, sort: 1 } }, { id: 'r-yard', name: '가상 운동장', props: { sort: 2 } }]);
const names = (r: ReturnType<typeof fakeRooms>) => r.snapshot().map((x) => x.name);

describe('방 관리 화면 — rooms 약속으로만', () => {
    it('약속이 없으면 꺼짐 안내', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(RoomManagePanel, { host: { modules: { use: () => null } } as unknown as PluginHost })));
        expect(host.textContent).toContain('꺼져 있습니다');
    });
    it('방 더하기 → 지우기, CSV 미리보기는 거절 줄 번호를 보이고 불러오면 약속에 반영된다', async () => {
        const rooms = seed();
        const host = await mount({ rooms });
        await type(host.querySelectorAll('input')[4] as HTMLInputElement, '가상 미술실');
        await click(host, '방 더하기');
        expect(names(rooms)).toContain('가상 미술실');
        const made = rooms.snapshot().find((r) => r.name === '가상 미술실')!;
        expect(rooms.roomProps(made.id).capacity).toBe(2);
        await click(host, '가상 미술실 지우기');
        expect(names(rooms)).toContain('가상 미술실'); // 첫 눌림은 되묻기만
        expect(host.textContent).toContain('정말 지울까요?');
        await click(host, '가상 미술실 지우기 확인');
        expect(names(rooms)).not.toContain('가상 미술실');

        await type(host.querySelector('textarea') as HTMLTextAreaElement, 'id,name,capacity,resourceKey,active,sort,note\n,가상 음악실,3,,true,5,\n,망가진,0,,true,6,\n');
        await click(host, '미리보기');
        expect(host.textContent).toContain('3줄: 정원은 비우거나(제한 없음) 1~20');
        expect(host.textContent).toContain('넣을 방 1');
        await click(host, '불러오기');
        expect(names(rooms)).toContain('가상 음악실');
        expect(rooms.roomProps(rooms.snapshot().find((r) => r.name === '가상 음악실')!.id).capacity).toBe(3);
    });
    it('이름·정원 저장과 끄기는 약속으로 가고, 이름이 겹치면 거절한다', async () => {
        const rooms = seed();
        const host = await mount({ rooms });
        await type(host.querySelector('[aria-label="가상 과학실 정원"]') as HTMLInputElement, '6');
        await click(host, '가상 과학실 저장');
        expect(rooms.roomProps('r-sci').capacity).toBe(6);
        await type(host.querySelector('[aria-label="가상 과학실 이름"]') as HTMLInputElement, '가상 운동장');
        await click(host, '가상 과학실 저장');
        expect(host.textContent).toContain('겹칩니다');
        expect(rooms.room('r-sci')?.name).toBe('가상 과학실');
        await click(host, '가상 운동장 끄기');
        expect(rooms.roomProps('r-yard').active).toBe(false);
        expect(host.textContent).toContain('가상 운동장 켜기');
    });
    it('방 목록이 없으면 더하기는 안내만 하고 아무것도 안 만든다', async () => {
        const rooms = fakeRooms([], false);
        const host = await mount({ rooms });
        await type(host.querySelectorAll('input')[0] as HTMLInputElement, '가상 방');
        await click(host, '방 더하기');
        expect(host.textContent).toContain('방 목록이 아직 없습니다');
        expect(rooms.snapshot().length).toBe(0);
    });
    it('지우기 취소하면 그대로 남고, 줄·폼은 줄바꿈 클래스가 걸려 있다', async () => {
        const rooms = seed();
        const host = await mount({ rooms });
        await click(host, '가상 과학실 지우기');
        await click(host, '지우기 취소');
        expect(rooms.snapshot().length).toBe(2);
        expect(host.textContent).not.toContain('정말 지울까요?');
        for (const el of host.querySelectorAll('[data-testid=room-row],[data-testid=form-row]')) expect(el.className).toContain('flex-wrap');
    });
    it('방 더하기만 파란 주 단추, 나머지는 테두리 보조 꼴', async () => {
        const host = await mount({ rooms: seed() });
        const btn = (t: string) => [...host.querySelectorAll('button')].find((x) => x.textContent === t) as HTMLButtonElement;
        expect(btn('방 더하기').className).toContain('bg-accent');
        for (const t of ['CSV 내보내기', '미리보기', '고정 사용 불러오기']) { expect(btn(t).className).toContain('border-line'); expect(btn(t).className).not.toContain('border-transparent'); }
    });
    it('방 속성 열기 단추가 방 예약의 방 속성 화면을 연다', async () => {
        const opened: string[] = [];
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = { modules: { use: () => seed() }, workspace: { open: (id: string) => { opened.push(id); } } } as unknown as PluginHost;
        await act(async () => createRoot(host).render(createElement(RoomManagePanel, { host: h })));
        await click(host, '방 속성 열기');
        expect(opened).toEqual(['room-booking.room-props']);
    });
    const pickFile = async (host: HTMLElement, text: string) => {
        const input = host.querySelector('input[type=file]') as HTMLInputElement;
        const file = new File([text], 'a.csv');
        (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer = async () => new TextEncoder().encode(text).buffer as ArrayBuffer; // jsdom File 에 없다
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    it('고정 사용 불러오기 — 반영하면 그 방 ext 에 쓰이고 돌아가면 목록 화면', async () => {
        const rooms = fakeRooms([{ id: 'r-sci', name: '과학실', props: { capacity: 4 } }]);
        const host = await mount({ rooms, newId: () => 'n1' });
        await click(host, '고정 사용 불러오기');
        expect(host.querySelector('input[type=file]')).not.toBeNull();
        expect(host.textContent).not.toContain('방 더하기');
        await pickFile(host, '요일,시각,과학실\r\n월,09:00~09:40,5-3 과학\r\n');
        await click(host, '이대로 반영');
        expect(fixedOf(rooms.room('r-sci')!).map((f) => [f.dayIndex, f.label])).toEqual([[0, '5-3 과학']]);
        await click(host, '돌아가기');
        expect(host.textContent).toContain('방 더하기');
    });
    it('고정 사용 불러오기 — 새 방 만들기를 고르면 약속의 addRoom 으로 방이 생긴다', async () => {
        const rooms = fakeRooms([]);
        const host = await mount({ rooms, newId: () => 'n1' });
        await click(host, '고정 사용 불러오기');
        await pickFile(host, '요일,시각,가상\r\n월,09:00~09:40,5-3 과학\r\n');
        await click(host, '이대로 반영');
        const made = rooms.snapshot().find((r) => r.name === '가상');
        expect(made).toBeTruthy();
        expect(fixedOf(made!).length).toBe(1);
    });
    it('겹침이면 약속에 아무것도 쓰지 않는다', async () => {
        const f = { dayIndex: 0, startMin: 540, endMin: 580, label: 'x' };
        const rooms = fakeRooms([{ id: 'r-yard', name: '운동장', props: { fixed: [f, { ...f }] } }, { id: 'r-sci', name: '과학실' }]);
        const host = await mount({ rooms, newId: () => 'n1' });
        await click(host, '고정 사용 불러오기');
        await pickFile(host, '요일,시각,과학실\r\n월,09:00~09:40,5-3 과학\r\n');
        await click(host, '이대로 반영');
        expect(fixedOf(rooms.room('r-yard')!).length).toBe(2);
        expect(fixedOf(rooms.room('r-yard')!).map((x) => x.label)).toEqual(['x', 'x']);
        expect(fixedOf(rooms.room('r-sci')!)).toEqual([]);
        expect(host.textContent).toContain('겹칩니다');
    });
});
