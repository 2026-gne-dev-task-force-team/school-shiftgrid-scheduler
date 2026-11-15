// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoDays, localDaysSource, memoryDaysSource } from './source';
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
        const click = (label: string) => act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        await click('3-2 4교시 지우기');
        expect(host.textContent).toContain('정말 지울까요?');
        expect((await src.load()).changes).toHaveLength(1); // 되묻기만 — 아직 안 지웠다
        await click('지우기 취소');
        expect(host.textContent).not.toContain('정말 지울까요?');
        expect((await src.load()).changes).toHaveLength(1);
        await click('3-2 4교시 지우기');
        await click('3-2 4교시 지우기 확인');
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
        await act(async () => createRoot(host).render(createElement(DaysView, { source: src, viewer: { userId: 'u-m', role: '교무' }, initialMonth: '2026-11', loadFile: async () => new TextEncoder().encode(csv) })));
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

describe('담임 과목 반영 권한', () => {
    const csv = '요일,시각,3-2\r\n월,09:00~09:40,주문외우기\r\n';
    const open = async (role: '교사' | '교무') => {
        const src = memoryDaysSource(demoDays());
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(DaysView, { source: src, viewer: { userId: 'u-x', role }, initialMonth: '2026-11', loadFile: async () => new TextEncoder().encode(csv) })));
        const btn = (label: string) => [...host.querySelectorAll('button')].find((x) => x.textContent === label) as HTMLButtonElement | undefined;
        await act(async () => { btn('담임 과목 불러오기')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        const input = host.querySelector('input[type=file]') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.csv')] });
        await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
        return { src, host, btn };
    };
    it('교사는 미리보기는 보이고 반영 단추는 비활성 + 이유 한 줄, 저장되지 않는다', async () => {
        const { src, host, btn } = await open('교사');
        expect(host.textContent).toContain('학급 1반');
        expect(btn('이대로 반영')?.disabled).toBe(true);
        expect(host.textContent).toContain('교무·관리자만 반영할 수 있습니다');
        await act(async () => { btn('이대로 반영')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect((await src.load()).classSubjects).toBeUndefined();
    });
    it('교무는 반영 단추가 살아 있다', async () => {
        const { btn, host } = await open('교무');
        expect(btn('이대로 반영')?.disabled).toBe(false);
        expect(host.textContent).not.toContain('교무·관리자만 반영할 수 있습니다');
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

describe('학사 영속 — 다시 만들어도 남는다', () => {
    it('변경을 넣고 지운 뒤 창구·패널을 새로 만들어도 바뀐 값이 남고, 데모 시드가 덮지 않는다', async () => {
        localStorage.clear();
        const mount = async () => {
            const src = localDaysSource(demoDays);
            const host = document.createElement('div');
            document.body.appendChild(host);
            await act(async () => createRoot(host).render(createElement(DaysView, { source: src, viewer: { userId: 'u-a', role: '교사' }, initialMonth: '2026-11', newId: () => 'n1' })));
            return host;
        };
        const click = (host: HTMLElement, label: string) => act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        let host = await mount();
        await click(host, '3-2 4교시 지우기');
        await click(host, '3-2 4교시 지우기 확인');
        expect(host.textContent).toContain('시간표 변경 0건');
        await click(host, '변경 넣기');
        document.body.innerHTML = ''; // 새로고침·창 크기 변화로 다시 붙는다
        host = await mount();
        expect((await localDaysSource(demoDays).load()).changes.map((c) => c.id)).not.toContain('c1');
        expect(host.textContent).not.toContain('3-2 4교시');
        localStorage.clear();
    });
});
