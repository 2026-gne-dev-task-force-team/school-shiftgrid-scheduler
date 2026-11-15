// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { memorySource } from './list';
import type { SubSlotRow } from './list';
import { RegisterView } from './RegisterPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

const old: SubSlotRow = {
    id: 'old', projectId: 'p1', date: '2026-11-12', trackName: '1-1', startMin: 580, endMin: 620, status: '대기', createdAt: 'a', updatedAt: 'a',
    body: { absentRef: 'homeroom:1-1', absentName: '가나다', registeredByName: '가짜올림', registeredBy: 'u-up', label: '', subject: null, reason: '병가', memo: '', allDay: false, preApproved: false },
    take: null,
};
const ctx = { projectId: 'p1', userId: 'u-up', userName: '가짜올림', now: () => 'n', newId: () => 'new' };
const initial = { date: '2026-11-12', start: '09:40', end: '10:20', trackName: '1-1', absentName: '가나다', reason: '새 사유' };

async function setup() {
    const src = memorySource([old]);
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(createElement(RegisterView, { source: src, ctx, initial })));
    const click = async (label: string) => {
        const b = [...host.querySelectorAll('button')].find((x) => x.textContent === label);
        await act(async () => { b?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };
    return { src, host, click };
}

describe('보결 등록 화면', () => {
    it('같은 칸이면 되묻기 줄이 뜨고, 취소하면 저장 0', async () => {
        const { src, host, click } = await setup();
        await click('등록');
        expect(host.querySelector('[role=alertdialog]')?.textContent).toContain('덮을까요');
        await click('취소');
        expect(host.querySelector('[role=alertdialog]')).toBeNull();
        expect((await src.loadSlots('2026-11-12'))[0].body.reason).toBe('병가');
    });
    it('덮어쓰기를 누르면 저장된다', async () => {
        const { src, host, click } = await setup();
        await click('등록');
        await click('덮어쓰기');
        expect((await src.loadSlots('2026-11-12'))[0].body.reason).toBe('새 사유');
        expect(host.textContent).toContain('덮어서 등록');
    });
    it('새 칸 등록이 성공하면 입력칸이 비고 「등록됨」이 보인다', async () => {
        const { src, host, click } = await setup2();
        await click('등록');
        expect(host.textContent).toContain('등록됨');
        expect((host.querySelector('input[placeholder="1-1"]') as HTMLInputElement).value).toBe('');
        expect((host.querySelector('input[placeholder="09:40"]') as HTMLInputElement).value).toBe('');
        expect((await src.loadSlots('2026-11-12')).length).toBe(1);
    });
    it('같은 내용을 두 번 올리면 중복 줄이 생기지 않고 되묻는다', async () => {
        const first = await setup2();
        await first.click('등록');
        const again = await setup2(first.src);
        await again.click('등록');
        expect(again.host.querySelector('[role=alertdialog]')?.textContent).toContain('덮을까요');
        expect((await first.src.loadSlots('2026-11-12')).length).toBe(1);
    });
});

async function setup2(src = memorySource([])) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(createElement(RegisterView, { source: src, ctx, initial })));
    const click = async (label: string) => {
        const b = [...host.querySelectorAll('button')].find((x) => x.textContent === label);
        await act(async () => { b?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };
    return { src, host, click };
}
