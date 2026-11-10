// @vitest-environment jsdom
/**
 * 일정 카드 동작 줄엔 저장소 칸만 — 내보내기·휴지통 단추는 없앴다(쥔님 2026-11-10 · 지우기는 틀 ⋯ 「휴지통으로」).
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
    act(() => { root!.render(<EventActions event={e} stores={[{ id: 's', name: '내 달력' } as never]} />); });
    return el.textContent ?? '';
}

describe('EventActions', () => {
    it('저장소 칸만 있고 내보내기·휴지통 단추는 없다', () => {
        const t = text(ev());
        expect(t).toContain('저장소');
        expect(t).not.toContain('휴지통');
        expect(t).not.toContain('내보내기');
    });
});
