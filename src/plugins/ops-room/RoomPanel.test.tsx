// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { RoomPanel } from './RoomPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

describe('특별실 예약 화면 자리 — 길잡이', () => {
    it('「방 예약으로 옮겼습니다」 와 열기 단추만 있고, 누르면 방 예약 화면을 연다', async () => {
        const opened: string[] = [];
        const host = { modules: { use: () => ({ cmd: { book: 'rb-book' } }) }, commands: { run: (id: string) => { opened.push(id); } } } as unknown as PluginHost;
        const el = document.createElement('div');
        document.body.appendChild(el);
        await act(async () => createRoot(el).render(createElement(RoomPanel, { host })));
        expect(el.textContent).toContain('방 예약으로 옮겼습니다');
        expect(el.querySelector('input')).toBeNull();
        await act(async () => { el.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(opened).toEqual(['rb-book']);
    });
});
