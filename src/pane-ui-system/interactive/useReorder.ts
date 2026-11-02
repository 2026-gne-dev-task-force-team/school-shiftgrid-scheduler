/**
 * 순서 바꾸기 — 🔴 ⭐ 「순서 있는 목록은 전부 드래그로」(쥔님 2026-11-01: *"순서 변경하는 거는 항상 드래그로"*).
 *   ⛔ 자리마다 드래그를 새로 짜지 않는다 — 리본·설정 목록·탭 재배열이 전부 이 훅 하나를 쓴다.
 *
 * 받는 것: 지금 순서(ids) · 축(axis: 세로 리스트 'y' · 가로 줄 'x') · onReorder(새 순서).
 * 주는 것: 컨테이너에 얹을 bind · 끄는 상태(drag) · 드롭 미리보기 선(indicator) · 트레일링 클릭 삼키개(draggedRef) ·
 *         키보드 재배열(onKeyDown — 접근성, Alt+방향키).
 *
 * 🔴 판정(무엇이 드래그·우클릭인가)은 useDragLeaf 한 곳에서 온다 — 여기선 「DOM 자리 → 어느 항목 앞/뒤」만 번역한다.
 *    번역 규칙은 drop-resolve(탭)·Rail(옛 ribbonDropAt)과 같은 결이다.
 */
import { useCallback, useRef, type RefObject, type MutableRefObject, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useDragLeaf, type DragAxis, type DragBind, type DragLeafState } from './useDragLeaf';
import { reorderIds, nudgeId } from '../layout/pane-settings';

/** 드롭 미리보기 선(쓰는 쪽이 그린다) — line: 주축 좌표 · cross: 교차축 시작 · size: 교차축 길이 */
export interface ReorderIndicator { line: number; cross: number; size: number }

export interface ReorderOpts {
    /** 지금 순서(드래그 결과를 이 배열 위에서 계산한다) */
    ids: string[];
    /** 세로 리스트(리본)면 'y' · 가로 줄이면 'x'. 판정 문턱은 등방이라 이건 방향용 */
    axis?: DragAxis;
    /** 끄는 걸 통째로 막는다(좁은 화면 등). 기본 true */
    enabled?: boolean;
    /** 새 순서가 나오면 부른다(저장은 쓰는 쪽이) */
    onReorder: (next: string[]) => void;
    /** 우클릭/길게누르기 passthrough — 쓰는 쪽이 제 메뉴를 연다(없으면 메뉴 없음) */
    onContext?: (x: number, y: number, el: HTMLElement) => void;
}

/** 포인터 자리에서 「어느 항목 앞/뒤에 꽂나」 — data-row-id 를 더듬어 번역(순수 아님, drop-resolve 와 같은 결) */
function dropAt(container: HTMLElement | null, p: number, dragId: string, horizontal: boolean):
    { targetId: string; pos: 'before' | 'after'; line: number; cross: number; size: number } | null {
    if (!container) return null;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]'));
    if (rows.length === 0) return null;
    const start = (r: DOMRect) => (horizontal ? r.left : r.top);
    const len = (r: DOMRect) => (horizontal ? r.width : r.height);
    const crossStart = (r: DOMRect) => (horizontal ? r.top : r.left);
    const crossLen = (r: DOMRect) => (horizontal ? r.height : r.width);
    for (const el of rows) {
        const r = el.getBoundingClientRect();
        if (p < start(r) + len(r) / 2) {
            const id = el.getAttribute('data-row-id')!;
            return { targetId: id, pos: 'before', line: start(r), cross: crossStart(r), size: crossLen(r) };
        }
    }
    const last = rows[rows.length - 1];
    const r = last.getBoundingClientRect();
    const id = last.getAttribute('data-row-id')!;
    if (id === dragId && rows.length === 1) return null;   // 자기 혼자 맨 끝 — 제자리
    return { targetId: id, pos: 'after', line: start(r) + len(r), cross: crossStart(r), size: crossLen(r) };
}

export function useReorder<E extends HTMLElement = HTMLElement>(opts: ReorderOpts): {
    containerRef: RefObject<E | null>;
    bind: DragBind;
    drag: DragLeafState | null;
    indicator: ReorderIndicator | null;
    /** 드래그로 끝난 뒤 따라오는 클릭 하나를 삼킨다(재배치 끝에 그 항목이 또 「눌린」 걸로 안 치게) */
    draggedRef: MutableRefObject<boolean>;
    onKeyDown: (e: ReactKeyboardEvent) => void;
} {
    const { ids, axis = 'y', enabled = true, onReorder, onContext } = opts;
    const horizontal = axis === 'x';
    const containerRef = useRef<E | null>(null);
    const draggedRef = useRef(false);

    const onDrop = useCallback((dragId: string, x: number, y: number) => {
        draggedRef.current = true;
        const hit = dropAt(containerRef.current, horizontal ? x : y, dragId, horizontal);
        if (!hit || hit.targetId === dragId) return;
        onReorder(reorderIds(ids, dragId, hit.targetId, hit.pos));
    }, [ids, horizontal, onReorder]);

    const { bind, drag } = useDragLeaf({ enabled, axis, onContext: onContext ?? (() => { /* 메뉴 없음 */ }), onDrop });

    // 🔴 키보드 재배열(접근성) — Alt+방향키로 포커스한 항목을 한 칸(쥔님 ⑨: *"키보드로도 되게"*).
    const onKeyDown = useCallback((e: ReactKeyboardEvent) => {
        if (!e.altKey) return;
        const delta = (!horizontal && e.key === 'ArrowUp') || (horizontal && e.key === 'ArrowLeft') ? -1
            : (!horizontal && e.key === 'ArrowDown') || (horizontal && e.key === 'ArrowRight') ? 1 : 0;
        if (!delta) return;
        const el = (e.target as HTMLElement).closest('[data-row-id]');
        const id = el?.getAttribute('data-row-id');
        if (!id) return;
        e.preventDefault();
        onReorder(nudgeId(ids, id, delta as -1 | 1));
    }, [ids, horizontal, onReorder]);

    const indicator: ReorderIndicator | null = drag
        ? (() => {
            const hit = dropAt(containerRef.current, horizontal ? drag.x : drag.y, drag.leafId, horizontal);
            return hit ? { line: hit.line, cross: hit.cross, size: hit.size } : null;
        })()
        : null;

    return { containerRef, bind, drag, indicator, draggedRef, onKeyDown };
}
