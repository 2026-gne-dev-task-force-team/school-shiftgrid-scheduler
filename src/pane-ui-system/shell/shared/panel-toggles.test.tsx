// @vitest-environment jsdom
/**
 * 🔴 T-30e — 리본에서 뺀 옆판·알림 토글.
 *   ① 셸 위쪽 모서리(가운데 끝 탭 줄 오른끝 trailing)에 토글 셋이 선다(aria-pressed 로 열림/닫힘).
 *   ② 토글 왕복 — Workbench.togglePanel 이 쓰는 그대로(findLeafByView + openLeaf/closeLeaf).
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceView, type WorkspaceHandlers } from './WorkspaceView';
import { IconButton } from '../../primitives/IconButton';
import { tabs, leaf, emptyWorkspace, openLeaf, closeLeaf, findLeafByView } from '../../layout/tree';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

function mount(el: React.ReactElement) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => { createRoot(host).render(el); });
    return host;
}

const noop = () => { };
const H: WorkspaceHandlers = {
    onActivate: noop, onClose: noop, onSplit: noop, onResize: noop, onAddToTabs: noop,
    onAddGlobal: noop, onCloseOthers: noop, onCloseRight: noop, onReopen: noop,
    onMove: noop, onRename: noop, onDropLeaf: noop,
};

describe('T-30e 옆판·알림 토글', () => {
    it('가운데 끝 탭 줄 오른끝에 탐색기·속성·알림 토글이 선다(aria-pressed)', () => {
        const node = tabs([leaf('x.view', '문서')]);
        const trailing = createElement('div', null,
            createElement(IconButton, { icon: 'folder', label: '탐색기', active: false, 'aria-pressed': false, onClick: noop }),
            createElement(IconButton, { icon: 'info', label: '속성', active: true, 'aria-pressed': true, onClick: noop }),
            createElement(IconButton, { icon: 'bell', label: '알림', active: false, 'aria-pressed': false, onClick: noop }),
        );
        const h = mount(createElement(WorkspaceView, { node, narrow: false, handlers: H, area: 'center', centerEdges: { trailing } }));
        expect(h.querySelector('[aria-label="탐색기"]'), '탐색기 토글이 그려진다').toBeTruthy();
        expect(h.querySelector('[aria-label="속성"]')?.getAttribute('aria-pressed'), '속성 열림').toBe('true');
        expect(h.querySelector('[aria-label="알림"]')?.getAttribute('aria-pressed'), '알림 닫힘').toBe('false');
    });

    it('토글 왕복 — 닫혀 있으면 열고(openLeaf) 떠 있으면 닫는다(closeLeaf)', () => {
        let ws = emptyWorkspace();
        expect(findLeafByView(ws, 'explorer.tree')).toBeNull();
        ws = openLeaf(ws, leaf('explorer.tree', '탐색기'), 'left');
        const lf = findLeafByView(ws, 'explorer.tree');
        expect(lf).toBeTruthy();
        ws = closeLeaf(ws, lf!.id);
        expect(findLeafByView(ws, 'explorer.tree')).toBeNull();
    });
});
