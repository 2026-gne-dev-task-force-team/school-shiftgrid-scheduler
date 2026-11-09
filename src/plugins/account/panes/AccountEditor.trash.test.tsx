// @vitest-environment jsdom
/** 휴지통에 든 계정 노드는 편집기 대신 「휴지통에 있는 항목입니다」 안내를 보여 준다 — 판정은 nodes.isTrashed (R5-8 회귀). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = { trashed: false, active: 'u1' as string | null };
vi.mock('../core', () => ({
    nodeKindOf: () => null,   // 휴지통 노드는 계정 종류로 안 읽힌다
    getNodesApi: () => ({ isTrashed: () => state.trashed }),
    parentOf: () => null,
}));
vi.mock('../nodes', () => ({
    getActiveAccountNode: () => state.active,
    subscribeActiveNode: () => () => {},
    setActiveAccountNode: () => {},
}));
vi.mock('./useAccount', () => ({ useAccountVersion: () => 0 }));
vi.mock('./RecordPage', () => ({ RecordPage: () => null }));
vi.mock('./PolicyEditor', () => ({ PolicyEditor: () => null }));
vi.mock('./AccountList', () => ({ AccountList: () => null }));

import { AccountEditor } from './AccountEditor';

let root: Root; let container: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); container.remove(); state.trashed = false; state.active = 'u1'; });
function render() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<AccountEditor />); });
}

describe('AccountEditor — 휴지통 판정', () => {
    it('휴지통에 든 노드면 안내 화면', () => {
        state.trashed = true;
        render();
        expect(container.textContent).toContain('휴지통에 있는 항목입니다');
    });
    it('열린 노드가 없으면 일반 안내', () => {
        state.active = null;
        render();
        expect(container.textContent).toContain('편집할 계정 항목을 고르세요');
    });
});
