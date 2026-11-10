// @vitest-environment jsdom
/** W13 — 사용자·역할 레코드 화면도 컬렉션 공통 RecordPage(→ page-doc 문서 한 벌)를 쓴다(제 편집기를 따로 안 짠다). */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { PluginHost } from '../../../pane-ui-system/plugin';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../core', () => ({
    getRecord: () => ({ name: '김선생', values: {} }),
    nodeKindOf: () => 'user',
    setRecordValue: vi.fn(), renameRecord: vi.fn(), setAccountBody: vi.fn(),
}));
vi.mock('./useAccount', () => ({ useAccountVersion: () => 0, allPermissions: () => [] }));
vi.mock('./fields', () => ({ accountFields: () => [{ key: 'name', label: '이름', type: 'text' }], canEdit: () => true, userValues: (_id: string, v: object) => v }));
vi.mock('./CredentialSlots', () => ({ CredentialSlots: () => null }));

import { RecordPage } from './RecordPage';

describe('계정 RecordPage', () => {
    it('컬렉션 모듈의 RecordPage 한 벌로 그린다(같은 부품)', () => {
        const Shared = vi.fn(() => null);
        const host = { modules: { use: (n: string) => (n === 'collection' ? { RecordPage: Shared } : undefined) } } as unknown as PluginHost;
        const div = document.createElement('div');
        const r = createRoot(div);
        act(() => { r.render(<RecordPage id="u1" host={host} />); });
        expect(Shared).toHaveBeenCalled();
        const p = (Shared.mock.calls[0] as unknown[])[0] as { id: string; onBody: unknown };
        expect(p.id).toBe('u1');
        expect(typeof p.onBody).toBe('function');
        act(() => r.unmount());
    });
});
