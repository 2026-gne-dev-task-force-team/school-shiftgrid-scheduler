// @vitest-environment jsdom
/** 중 2 — 크롬이 먼저 먹는 예약 키는 저장하지 않고 안내한다. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { getKeyOverrides, resetAllKeyOverrides } from '../../../pane-ui-system';
import { addCommand } from '../../../pane-ui-system/plugin/store';
import { KeybindingsPane, isBrowserReserved } from './KeybindingsPane';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { resetAllKeyOverrides(); document.body.innerHTML = ''; });

describe('단축키 예약 키', () => {
    it('목록 판정', () => {
        for (const k of ['Mod+N', 'Mod+T', 'Mod+W', 'Mod+Shift+T', 'Mod+Shift+N', 'Ctrl+Tab']) expect(isBrowserReserved(k)).toBe(true);
        expect(isBrowserReserved('Mod+K')).toBe(false);
    });
    it('예약 키를 누르면 저장 안 되고 안내가 뜬다', () => {
        addCommand('qa', { id: 'qa.cmd', title: 'QA 명령', run: () => {} } as never);
        const el = document.createElement('div'); document.body.appendChild(el);
        const root = createRoot(el);
        act(() => { root.render(<KeybindingsPane host={{} as never} />); });
        const b = [...el.querySelectorAll('button')].find((x) => x.textContent === '바꾸기')!;
        act(() => { b.click(); });
        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', ctrlKey: true, bubbles: true })); });
        expect(getKeyOverrides()['qa.cmd']).toBeUndefined();
        expect(el.textContent).toContain('브라우저가 먼저 가로채는 키라 쓸 수 없습니다');
        act(() => { root.unmount(); });
    });
});
