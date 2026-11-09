/**
 * 속성 패널 자리 증명 — ① 남의 플러그인이 contributes.properties 로 낸 칸이 그 종류(target)에만 꽂힌다
 *   ② 패널이 그 칸을 order 순으로 쌓아 target 을 넘겨 그린다 ③ 그 플러그인을 끄면 칸이 빠진다.
 */
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { definePlugin, activateAll, disablePlugin, disposeOwner, listPropertiesPanes, type PropertiesPaneProps } from '../../pane-ui-system/plugin';
import { PropertiesBody } from './views/PropertiesPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Name = ({ target }: PropertiesPaneProps) => createElement('p', null, `이름:${target.id}`);
const When = ({ target }: PropertiesPaneProps) => createElement('p', null, `날짜:${target.id}`);

const fake = definePlugin({
    manifest: {
        id: 'pfake', name: 'P Fake', version: '0.1.0', minHostVersion: '0.1.0',
        contributes: {
            properties: [
                { target: 'pfake.event', id: 'when', title: '날짜', pane: 'When', order: 2 },
                { target: 'pfake.event', id: 'name', title: '이름', pane: 'Name', order: 1 },
            ],
        },
    },
    panes: { Name, When },
});

beforeEach(() => { disposeOwner('pfake'); });

describe('속성 패널 자리', () => {
    it('칸은 그 종류에만 꽂히고, order 순으로 쌓여 target 을 받는다', () => {
        activateAll([fake]);
        expect(listPropertiesPanes('pfake.event').map((p) => p.id)).toEqual(['name', 'when']);
        expect(listPropertiesPanes('다른.종류')).toEqual([]);

        const el = document.createElement('div');
        const root = createRoot(el);
        act(() => root.render(createElement(PropertiesBody, { target: { type: 'pfake.event', id: 'e1' } })));
        expect(el.textContent).toContain('이름이름:e1날짜날짜:e1');
        act(() => root.render(createElement(PropertiesBody, { target: null })));
        expect(el.textContent).toContain('고른 것이 없습니다');
        act(() => root.unmount());
    });

    it('플러그인을 끄면 칸이 빠진다', () => {
        activateAll([fake]);
        disablePlugin('pfake');
        expect(listPropertiesPanes('pfake.event')).toEqual([]);
    });
});
