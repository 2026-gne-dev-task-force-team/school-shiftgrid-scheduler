// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { PlansTab } from './PlansTab';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

describe('편성안 화면 — v1 파일 내보내기 길잡이(T-10fx)', () => {
    it('편성안이 0 이어도 「v1 파일로 내보내기」 단추가 보이고 누르면 cmd.open 을 부른다', async () => {
        const opened: string[] = [];
        const host = { modules: { use: (n: string) => (n === 'v1-file' ? { cmd: { open: 'v1-open' } } : null) }, commands: { run: (id: string) => { opened.push(id); } } } as unknown as PluginHost;
        const el = document.createElement('div');
        document.body.appendChild(el);
        await act(async () => createRoot(el).render(createElement(PlansTab, { host })));
        const b = [...el.querySelectorAll('button')].find((x) => x.textContent === 'v1 파일로 내보내기');
        expect(b).toBeTruthy();
        await act(async () => { b!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(opened).toEqual(['v1-open']);
    });
});
