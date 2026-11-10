// @vitest-environment jsdom
/** 사용자 테마 「지우기」 — 즉시 영구삭제가 아니라 알림 + 되돌리기(R3-S). */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { addUserTheme, removeUserTheme, getUserThemesForTest } from '../../../pane-ui-system/theme/user-themes';
import { undoReset } from '../reset-undo';
import { ThemeEditor } from './ThemeEditor';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; getUserThemesForTest().forEach((t) => removeUserTheme(t.id)); });

describe('ThemeEditor 지우기', () => {
    it('지우면 알림이 뜨고, 되돌리기를 누르면 같은 테마가 돌아온다', () => {
        addUserTheme({ name: '내 테마', base: 'light', colors: {} });
        const notify = vi.fn();
        const host = { notify } as unknown as PluginHost;
        const theme = { settings: {}, setSettings: vi.fn() } as never;
        const el = document.createElement('div'); document.body.appendChild(el);
        root = createRoot(el);
        act(() => { root!.render(<ThemeEditor theme={theme} host={host} />); });
        const del = [...el.querySelectorAll('button')].find((b) => b.textContent === '지우기')!;
        act(() => { del.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(getUserThemesForTest()).toHaveLength(0);
        const n = notify.mock.calls.at(-1)![0];
        expect(n.title).toContain('내 테마');
        expect(n.action.label).toBe('되돌리기');
        act(() => { undoReset({ args: n.action.args } as never); });
        expect(getUserThemesForTest().map((t) => t.name)).toEqual(['내 테마']);
    });
});
