// @vitest-environment jsdom
/** 검수 r1 S3 — 칸 메뉴 초점·라벨 · Enter 로 만든 빈 행 치우기 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordView } from './RecordView';
import type { RecordField } from './contracts/collection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Rec = { id: string } & Record<string, unknown>;
const F: RecordField[] = [{ key: 'f_t', label: '제목', type: 'text' }, { key: 'f_x', label: '값', type: 'text' }];
let root: Root | null = null;
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const click = (el: Element | null) => act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function H({ init }: { init: Rec[] }) {
    const [rows, setRows] = useState<Rec[]>(init);
    return (
        <RecordView<Rec> fields={F} records={rows} getId={(r) => r.id} viewKey="t.qa" titleKey="f_t"
            onCellChange={(id, k, v) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)))}
            onAddRecord={() => setRows((rs) => [...rs, { id: `n${rs.length}`, f_t: '' }])}
            onFieldsChange={() => {}} />
    );
}
beforeEach(() => { localStorage.clear(); });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
function mount(ui: React.ReactElement) { const el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); act(() => { root!.render(ui); }); }

describe('칸 메뉴', () => {
    it('열어도 이름 입력칸에 초점이 안 가고 「칸 이름」 라벨이 보인다', () => {
        mount(<H init={[]} />);
        click(q('[data-rv-head-menu="f_x"]'));
        const input = q('[data-rv-rename="f_x"] input')!;
        expect(document.activeElement).not.toBe(input);
        expect(q('[data-rv-rename="f_x"]')!.textContent).toContain('칸 이름');
    });
});

describe('Enter 로 만든 빈 행', () => {
    const editFirst = () => click(q('[data-rv-row="r0"] [data-rv-cell="f_t"]'));
    it('검수 K25 — 마지막 행 Enter 는 새 행을 안 만든다(확정만 · 편집 닫힘)', async () => {
        mount(<H init={[{ id: 'r0', f_t: 'A' }]} />);
        editFirst();
        key(q('[data-rv-editing]')!, 'Enter');
        await wait(50);
        expect(q('[data-rv-row="n1"]')).toBeNull();
        expect(q('[data-rv-editing]')).toBeNull();
    });
    it('원래 있던 빈 행은 건드리지 않는다', async () => {
        mount(<H init={[{ id: 'r0', f_t: '' }]} />);
        editFirst();
        key(q('[data-rv-editing]')!, 'Escape');
        await wait(400);
        expect(q('[data-rv-row="r0"]')).not.toBeNull();
    });
});

describe('Q15 긴 제목 말줄임', () => {
    it('글자 칸 안쪽 span 이 truncate + title(전체 제목)을 가진다', () => {
        const long = '아주아주 긴 제목 '.repeat(12);
        mount(<H init={[{ id: 'a', f_t: long, f_x: 'x' }]} />);
        const span = q('[data-rv-cell="f_t"] span') as HTMLElement;
        expect(span.className).toContain('truncate');
        expect(span.getAttribute('title')).toBe(long);
    });
});
