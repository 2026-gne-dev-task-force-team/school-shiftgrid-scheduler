// @vitest-environment jsdom
/** 칸 412 버튼 둘 — 내려받기가 먼저, 그다음 resolve (P7). */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictDoc } from './conflict-doc';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });

function mount(ok: boolean) {
    const order: string[] = [];
    const download = vi.fn((name: string, t: string) => { order.push(`download:${t}`); void name; });
    const confirm = vi.fn(async () => { order.push('confirm'); return ok; });
    const resolve = vi.fn(async (_p: string, r: { keep: string }) => { order.push(`resolve:${r.keep}`); });
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el);
    act(() => {
        root!.render(<ConflictDoc part="doc" serverBody={{ s: 1 }} serverEtag='"1.3"' mine={{ m: 1 }}
            download={download} confirm={confirm} queue={{ resolve }} />);
    });
    const click = async (label: string) => {
        const b = [...el.querySelectorAll('button')].find(x => x.textContent === label)!;
        await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };
    return { order, download, resolve, click };
}

describe('ConflictDoc', () => {
    it('서버 판 열기 → 내 값 내려받기 1회, 그 뒤 resolve(server)', async () => {
        const t = mount(true);
        await t.click('서버 판 열기');
        expect(t.download).toHaveBeenCalledTimes(1);
        expect(JSON.parse(t.download.mock.calls[0][1])).toEqual({ m: 1 });
        expect(t.order).toEqual([expect.stringMatching(/^download:/), 'resolve:server']);
        expect(t.resolve).toHaveBeenCalledWith('doc', { etag: '"1.3"', value: { s: 1 }, keep: 'server' });
    });
    it('내 판으로 덮기 · 거절 → 아무것도 안 한다', async () => {
        const t = mount(false);
        await t.click('내 판으로 덮기');
        expect(t.order).toEqual(['confirm']);
        expect(t.download).not.toHaveBeenCalled();
        expect(t.resolve).not.toHaveBeenCalled();
    });
    it('내 판으로 덮기 · 승인 → 서버 값 내려받기 1회, 그 뒤 resolve(mine)', async () => {
        const t = mount(true);
        await t.click('내 판으로 덮기');
        expect(t.download).toHaveBeenCalledTimes(1);
        expect(JSON.parse(t.download.mock.calls[0][1])).toEqual({ s: 1 });
        expect(t.order).toEqual(['confirm', expect.stringMatching(/^download:/), 'resolve:mine']);
        expect(t.resolve).toHaveBeenCalledWith('doc', { etag: '"1.3"', value: { m: 1 }, keep: 'mine' });
    });
});
