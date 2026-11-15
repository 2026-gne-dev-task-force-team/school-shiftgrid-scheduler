// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ClassImportView } from './ClassImportView';
import type { ClassSubject } from './classImport';
import { magicFrame } from './magicFrame';
import { csvBytes } from './synth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

async function mount(bytes: Uint8Array, name: string, current: ClassSubject[] = []) {
    const applied: ClassSubject[][] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(createElement(ClassImportView, { frame: magicFrame(), current, onApply: (n) => { applied.push(n); }, loadFile: async () => bytes })));
    const input = host.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], name)] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    return { host, applied };
}
const click = (host: HTMLElement, label: string) => act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('담임 과목 불러오기 화면', () => {
    it('파일을 고르면 결과 판이 뜨고, 반영하면 새 목록이 넘어간다', async () => {
        const csv = '요일,시각,3-2,3-4\r\n월,09:00~09:40,주문외우기,맨드레이크합창(전담)\r\n월,12:20~13:00,수비학,\r\n';
        const { host, applied } = await mount(new TextEncoder().encode(csv), 'a.csv');
        expect(host.textContent).toContain('학급 2반');
        expect(host.textContent).toContain('3-2 (교사01) 담임 칸 2 · 추가 2');
        expect(host.textContent).toContain('월 09:00 전담 칸 어긋남 — 파일 「맨드레이크합창」 ≠ 편성 「빗자루비행」');
        await click(host, '이대로 반영');
        expect(applied).toEqual([[
            { trackName: '3-2', dayIndex: 0, start: '09:00', subject: '주문외우기' },
            { trackName: '3-2', dayIndex: 0, start: '12:20', subject: '수비학' },
        ]]);
        expect(host.textContent).toContain('반영했습니다: 3-2 2칸, 3-4 0칸');
    });
    it('깨진 파일이면 ❌ 이유만 뜨고 반영 단추가 없다', async () => {
        const { host, applied } = await mount(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]), 'bad.xlsx');
        expect(host.querySelector('[role=alert]')?.textContent).toContain('❌ bad.xlsx — xlsx 를 읽지 못함');
        expect([...host.querySelectorAll('button')].some((b) => b.textContent === '이대로 반영')).toBe(false);
        expect(applied).toEqual([]);
    });
    it('학급 열이 없는 표도 ❌', async () => {
        const { host } = await mount(csvBytes([['과목', '시수'], ['국어', '4']]), 'x.csv');
        expect(host.querySelector('[role=alert]')?.textContent).toContain('학급 시간표 표를 찾지 못했습니다');
    });
});
