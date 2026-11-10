/**
 * 일정 칩 키보드 접근(W9) — 칩(data-event-id)을 Tab 으로 닿고 Enter·Space 로 연다.
 *   칸 바깥 위임 한 곳(onKeyDown)이 받는다 — 칩마다 핸들러를 달지 않는다.
 *   ⛔ 칩 안쪽 입력칸 등에서 온 키는 무시한다(target 이 칩 자신일 때만).
 */
import type { KeyboardEvent } from 'react';
import { isImeEnter } from '../../../pane-ui-system';

/** 칩에 펼쳐 줄 속성 — 초점 가능 + 단추 역할 */
export const CHIP_A11Y = { tabIndex: 0, role: 'button' } as const;

/** Enter·Space 가 칩 자신에서 났으면 그 일정 id(기본 동작은 막는다) · 아니면 null */
export function chipKeyId(e: Pick<KeyboardEvent, 'key' | 'target' | 'preventDefault'>): string | null {
    if (e.key !== 'Enter' && e.key !== ' ') return null;
    if (isImeEnter(e as Parameters<typeof isImeEnter>[0])) return null;   // 한글 조합 중 Enter 는 확정이 아니다
    const t = e.target as HTMLElement | null;
    const id = t?.getAttribute?.('data-event-id');
    if (!id) return null;
    e.preventDefault();
    return id;
}
