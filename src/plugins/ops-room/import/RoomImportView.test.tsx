// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { magicFrame } from '../../ops-days/import/magicFrame';
import type { Room, RoomFixed } from '../book';
import { RoomImportView } from './RoomImportView';
import { csvBytes, hwpxBytes } from './synth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

const rooms: Room[] = [{ id: 'r1', name: '마법약실', capacity: 2, resourceKey: null, active: true, sort: 1, note: '' }];
async function mount(bytes: Uint8Array, name: string, fixed: RoomFixed[] = []) {
    const applied: { rooms: Room[]; fixed: RoomFixed[] }[] = [];
    let k = 0;
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(createElement(RoomImportView, { frame: magicFrame(), rooms, fixed, newId: () => `n${++k}`, onApply: (n) => { applied.push(n); }, loadFile: async () => bytes })));
    const input = host.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], name)] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    return { host, applied };
}
const click = (host: HTMLElement, label: string) => act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('특별실 고정 사용 불러오기 화면', () => {
    it('파일을 고르면 결과 판이 뜨고, 반영하면 같은 이름 방에 들어간다', async () => {
        const csv = '요일,시각,마법약실,등잔밑이어둡관\r\n월,09:00~09:40,5-3 마법약,3-4\r\n';
        const { host, applied } = await mount(new TextEncoder().encode(csv), 'a.csv');
        expect(host.textContent).toContain('방 2곳');
        expect(host.textContent).toContain('마법약실 고정 1칸');
        expect((host.querySelector('select[aria-label="마법약실 넣을 곳"]') as HTMLSelectElement).value).toBe('r1');
        expect((host.querySelector('select[aria-label="등잔밑이어둡관 넣을 곳"]') as HTMLSelectElement).value).toBe('new');
        await click(host, '이대로 반영');
        expect(applied.length).toBe(1);
        expect(applied[0].rooms.map((r) => r.name)).toEqual(['마법약실', '등잔밑이어둡관']);
        expect(applied[0].fixed.map((f) => [f.roomId, f.label])).toEqual([['r1', '5-3 마법약'], ['n2', '3-4']]); // n1 은 새 방 id
        expect(host.textContent).toContain('반영했습니다: 마법약실 1칸, 등잔밑이어둡관(새 방) 1칸');
    });
    it('모호한 줄은 시각을 골라 주면 다시 읽는다', async () => {
        const rows = [['학반', '마법약실', '', '', '', ''], ['요일 교시', '월', '화', '수', '목', '금'], ['4', '3-2', '', '', '', '']];
        const { host } = await mount(hwpxBytes([rows]), 'a.hwpx');
        expect(host.textContent).toContain('시각을 골라 주세요');
        await click(host, '「4」→ 12:20 (3학년)');
        expect(host.textContent).toContain('마법약실 고정 1칸');
        expect(host.textContent).not.toContain('시각을 골라 주세요');
    });
    it('깨진 파일이면 ❌ 이유만 뜨고 반영 단추가 없다', async () => {
        const { host, applied } = await mount(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]), 'bad.xlsx');
        expect(host.querySelector('[role=alert]')?.textContent).toContain('❌ bad.xlsx — xlsx 를 읽지 못함');
        expect([...host.querySelectorAll('button')].some((b) => b.textContent === '이대로 반영')).toBe(false);
        expect(applied).toEqual([]);
    });
    it('요일 줄이 없는 표도 ❌', async () => {
        const { host } = await mount(csvBytes([['과목', '시수'], ['국어', '4']]), 'x.csv');
        expect(host.querySelector('[role=alert]')?.textContent).toContain('요일(월~금) 줄이 있는 표를 찾지 못했습니다');
    });
    it('건너뛰기를 고르면 그 방은 반영하지 않는다', async () => {
        const csv = '요일,시각,마법약실,등잔밑이어둡관\r\n월,09:00~09:40,5-3 마법약,3-4\r\n';
        const { host, applied } = await mount(new TextEncoder().encode(csv), 'a.csv');
        const sel = host.querySelector('select[aria-label="등잔밑이어둡관 넣을 곳"]') as HTMLSelectElement;
        await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(sel, 'skip'); sel.dispatchEvent(new Event('change', { bubbles: true })); });
        await click(host, '이대로 반영');
        expect(applied[0].rooms.map((r) => r.name)).toEqual(['마법약실']);
    });
});
