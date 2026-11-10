// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Table } from './Table';
import type { TableColumn, TableRow } from './contracts/table';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LONG = '가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라';
let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(columns: TableColumn[]) {
    const rows: TableRow[] = [{ id: 'r1', label: '3교시', cells: { a: LONG, b: 'x' } }];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => { root!.render(<Table columns={columns} rows={rows} features={['row-head']} onCommit={() => {}} />); });
}
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = null; host = null; });

describe('Table — 긴 글 칸', () => {
    it('열 폭이 정해진 칸은 말줄임 상자 + title 전체, 폭이 없는 열은 그대로', () => {
        mount([{ key: 'a', title: 'A', width: 80 }, { key: 'b', title: 'B' }]);
        const a = host!.querySelector('td[data-rc="0:0"]')!;
        const box = a.querySelector('[data-clamp]') as HTMLElement;
        expect(box.className).toContain('truncate');
        expect(box.style.maxWidth).toBe('68px');
        expect(a.getAttribute('title')).toBe(LONG);
        expect(host!.querySelector('td[data-rc="0:1"] [data-clamp]')).toBeNull();
    });
    it('교시 라벨(행 머리)은 select-none', () => {
        mount([{ key: 'a', title: 'A', width: 80 }]);
        expect(host!.querySelector('th[data-row-head]')!.className).toContain('select-none');
    });
});
