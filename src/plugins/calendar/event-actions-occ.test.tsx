// @vitest-environment jsdom
/**
 * 회차 카드(event.occ)에서는 휴지통 단추를 숨긴다(「이 회차 빠뜨리기」와 같은 동작) — 일반 일정엔 그대로.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, afterEach } from 'vitest';
import { EventActions } from './views/EventActions';
import type { CalEvent } from './events';

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; });
const ev = (occ?: unknown) => ({ id: 'e', storeId: 's', name: 'x', occ } as unknown as CalEvent);
function text(e: CalEvent): string {
    const el = document.createElement('div');
    root = createRoot(el);
    act(() => { root!.render(<EventActions event={e} stores={[]} />); });
    return el.textContent ?? '';
}

describe('EventActions 휴지통', () => {
    it('일반 일정은 휴지통이 보이고, 회차 카드는 숨긴다', () => {
        expect(text(ev())).toContain('휴지통');
        act(() => root?.unmount());
        expect(text(ev({ virtual: true }))).not.toContain('휴지통');
    });
});
