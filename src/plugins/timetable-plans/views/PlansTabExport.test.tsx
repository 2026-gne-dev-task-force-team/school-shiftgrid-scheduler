// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { initPlans } from '../nodes';
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

describe('편성안 화면 — 「위반 N건」을 누르면 위반 목록이 열린다(T-10gc)', () => {
    it('단추를 누르면 위반 목록 칸이 나오고 다시 누르면 접힌다', async () => {
        const plan = { name: '시험안', madeAt: '2099-01-01T00:00:00.000Z', chosen: false, placements: [], summary: { score: null, hardViolations: 2, softViolations: 1 } };
        const node = { id: 'n1', name: '시험안', data: plan };
        initPlans({ liveByType: () => [node], get: () => node, subscribe: () => () => {} } as unknown as NodesApi);
        try {
            const host = { modules: { use: () => null }, commands: { run: () => {} } } as unknown as PluginHost;
            const el = document.createElement('div');
            document.body.appendChild(el);
            await act(async () => createRoot(el).render(createElement(PlansTab, { host })));
            const find = () => [...el.querySelectorAll('button')].find((x) => x.textContent === '위반 3건');
            expect(find()).toBeTruthy();
            expect(el.querySelector('[aria-label="위반 목록"]')).toBeNull();
            await act(async () => { find()!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
            expect(el.querySelector('[aria-label="위반 목록"]')).not.toBeNull();
            await act(async () => { find()!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
            expect(el.querySelector('[aria-label="위반 목록"]')).toBeNull();
        } finally { initPlans(null); }
    });
});
