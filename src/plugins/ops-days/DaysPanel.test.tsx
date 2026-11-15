// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoDays, memoryDaysSource } from './source';
import { DaysView, resetDaysTab } from './DaysPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; resetDaysTab(); });

describe('학사 화면', () => {
    it('일정·변경이 달 목록에 뜨고, 교사는 자기 변경을 지울 수 있다', async () => {
        const src = memoryDaysSource(demoDays());
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(DaysView, { source: src, viewer: { userId: 'u-a', role: '교사' }, initialMonth: '2026-11' })));
        expect(host.textContent).toContain('[휴업] 개교기념일');
        expect(host.textContent).toContain('시간표 변경 1건');
        await act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === '3-2 4교시 지우기')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect((await src.load()).changes).toHaveLength(0);
    });
});

describe('담임 과목 불러오기 달기', () => {
    const csv = '요일,시각,3-2\r\n월,09:00~09:40,주문외우기\r\n';
    it('패널에서 화면이 열리고, 반영하면 classSubjects 가 저장되어 다시 읽힌다(다른 칸은 그대로)', async () => {
        const src = memoryDaysSource(demoDays());
        expect((await src.load()).classSubjects).toBeUndefined(); // 옛 자료
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(DaysView, { source: src, initialMonth: '2026-11', loadFile: async () => new TextEncoder().encode(csv) })));
        const click = (label: string) => act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        await click('담임 과목 불러오기');
        const input = host.querySelector('input[type=file]') as HTMLInputElement;
        expect(input).not.toBeNull();
        Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.csv')] });
        await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
        await click('이대로 반영');
        const after = await src.load();
        expect(after.classSubjects).toEqual([{ trackName: '3-2', dayIndex: 0, start: '09:00', subject: '주문외우기' }]);
        expect(after.changes).toHaveLength(1);
        expect(after.calendar).toHaveLength(2);
    });
});

describe('창 크기 변화', () => {
    it('불러오기 화면을 연 채 다시 마운트돼도 불러오기 화면이 남는다', async () => {
        const src = memoryDaysSource(demoDays());
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => root.render(createElement(DaysView, { source: src, initialMonth: '2026-11' })));
        await act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === '담임 과목 불러오기')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(host.querySelector('input[type=file]')).not.toBeNull();
        await act(async () => root.unmount());
        const host2 = document.createElement('div');
        document.body.appendChild(host2);
        await act(async () => createRoot(host2).render(createElement(DaysView, { source: src, initialMonth: '2026-11' })));
        expect(host2.querySelector('input[type=file]')).not.toBeNull();
    });
    it('변경 넣기 줄은 좁은 폭에서 줄바꿈된다', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(DaysView, { source: memoryDaysSource(demoDays()), initialMonth: '2026-11' })));
        expect(host.querySelector('.flex-wrap')?.textContent).toContain('과목');
    });
});
