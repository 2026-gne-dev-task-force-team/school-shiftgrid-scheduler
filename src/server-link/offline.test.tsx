// @vitest-environment jsdom
/** 끊김 잠금·연결 상태 판 (P9). */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionBar, isLocked } from './offline';
import type { PartState, QueueStatus } from './parts';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });

function mount(initial: QueueStatus) {
    let st = initial;
    const subs = new Set<() => void>();
    const order: string[] = [];
    const queue = {
        status: () => st,
        subscribe: (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; },
        resume: vi.fn(async () => { order.push('resume'); }),
        flush: vi.fn(async () => { order.push('flush'); }),
    };
    const onRelogin = vi.fn(async () => { order.push('relogin'); });
    const onOpenConflict = vi.fn();
    const el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el);
    act(() => { root!.render(<ConnectionBar queue={queue} onRelogin={onRelogin} onOpenConflict={onOpenConflict} />); });
    const push = (s: QueueStatus) => { st = s; act(() => { subs.forEach(f => f()); }); };
    const text = () => el.querySelector('[role=status]')!.textContent!.replace(/\s+/g, ' ').trim();
    const buttons = () => [...el.querySelectorAll('button')].map(b => b.textContent);
    const click = async (label: string) => {
        const b = [...el.querySelectorAll('button')].find(x => x.textContent === label)!;
        await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };
    return { queue, onRelogin, onOpenConflict, order, push, text, buttons, click, subs };
}

describe('ConnectionBar', () => {
    it('상태 넷 + relogin 문구', () => {
        const t = mount({ kind: 'saved' });
        expect(t.text()).toBe('저장됨');
        t.push({ kind: 'saving' });
        expect(t.text()).toBe('올리는 중…');
        t.push({ kind: 'pending', count: 2 });
        expect(t.text()).toContain('안 올라간 변경 2칸');
        t.push({ kind: 'conflict', parts: ['doc'] });
        expect(t.text()).toContain('충돌 1칸');
        t.push({ kind: 'relogin' });
        expect(t.text()).toContain('다시 로그인하면 이어서 올립니다');
    });
    it('503 과 네트워크는 같은 문구(큐에서 둘 다 offline) · n칸 숫자 · 새 링크 안내 없음', () => {
        const a = mount({ kind: 'offline', count: 3 });
        const first = a.text();
        expect(first).toBe('서버에 닿지 않습니다 — 잠시 뒤 다시 올립니다 · 안 올라간 변경 3칸 지금 올리기');
        expect(first).not.toContain('새 링크');
        a.push({ kind: 'offline', count: 7 });
        expect(a.text()).toContain('변경 7칸');
    });
    it('다시 로그인 → onRelogin 뒤 resume', async () => {
        const t = mount({ kind: 'relogin' });
        await t.click('다시 로그인');
        expect(t.order).toEqual(['relogin', 'resume']);
    });
    it('지금 올리기 → flush · pending·offline 에서만 보인다', async () => {
        const t = mount({ kind: 'pending', count: 1 });
        await t.click('지금 올리기');
        expect(t.queue.flush).toHaveBeenCalledTimes(1);
        for (const s of [{ kind: 'saved' }, { kind: 'saving' }, { kind: 'relogin' }, { kind: 'conflict', parts: ['a'] }] as QueueStatus[]) {
            t.push(s);
            expect(t.buttons()).not.toContain('지금 올리기');
        }
        t.push({ kind: 'offline', count: 1 });
        expect(t.buttons()).toContain('지금 올리기');
    });
    it('충돌 칸 이름 클릭 → onOpenConflict(part)', async () => {
        const t = mount({ kind: 'conflict', parts: ['doc', 'ops.settings'] });
        expect(t.buttons()).toEqual(['doc', 'ops.settings']);
        await t.click('ops.settings');
        expect(t.onOpenConflict).toHaveBeenCalledWith('ops.settings');
    });
    it('unmount 뒤 밀어도 오류 없음(구독 해제)', () => {
        const t = mount({ kind: 'saved' });
        expect(t.subs.size).toBe(1);
        act(() => { root!.unmount(); }); root = null;
        expect(t.subs.size).toBe(0);
        expect(() => t.push({ kind: 'saving' })).not.toThrow();
    });
    it('잠금 표 스냅숏 — 상태별 (문구, 버튼)', () => {
        const rows: QueueStatus[] = [
            { kind: 'saved' }, { kind: 'saving' }, { kind: 'pending', count: 2 }, { kind: 'offline', count: 2 },
            { kind: 'conflict', parts: ['doc', 'ops.settings'] }, { kind: 'error', parts: ['doc'] }, { kind: 'relogin' },
        ];
        const t = mount(rows[0]);
        const table = rows.map(s => { t.push(s); return [s.kind, t.text(), t.buttons()]; });
        expect(table).toMatchInlineSnapshot(`
          [
            [
              "saved",
              "저장됨",
              [],
            ],
            [
              "saving",
              "올리는 중…",
              [],
            ],
            [
              "pending",
              "안 올라간 변경 2칸 지금 올리기",
              [
                "지금 올리기",
              ],
            ],
            [
              "offline",
              "서버에 닿지 않습니다 — 잠시 뒤 다시 올립니다 · 안 올라간 변경 2칸 지금 올리기",
              [
                "지금 올리기",
              ],
            ],
            [
              "conflict",
              "충돌 2칸docops.settings",
              [
                "doc",
                "ops.settings",
              ],
            ],
            [
              "error",
              "저장 오류 1칸 — doc",
              [],
            ],
            [
              "relogin",
              "다시 로그인하면 이어서 올립니다 다시 로그인",
              [
                "다시 로그인",
              ],
            ],
          ]
        `);
    });
});

describe('isLocked', () => {
    it('conflict·error 칸만 true', () => {
        const q = (state: PartState) => ({ partInfo: () => ({ state }) });
        const got = (['clean', 'dirty', 'saving', 'conflict', 'error'] as PartState[]).map(s => isLocked('x', q(s)));
        expect(got).toEqual([false, false, false, true, true]);
    });
});
