/**
 * 우클릭/길게 누르기 판정 — 🔴 ⭐ 「무엇이 우클릭인가」는 이 훅 한 곳에만 산다 (쥔님 지시 2026-10-31).
 *   - 마우스: contextmenu(오른쪽 버튼)
 *   - 손가락: 350ms 길게 누르기 (pointerType 으로 가른다 · 10px 넘게 움직이면 스크롤/드래그로 보고 취소)
 * ⛔ 이 판정을 다른 데로 복사하지 말 것 — 쓰는 쪽은 이 훅이 주는 핸들러를 컨테이너에 얹기만 한다.
 *   onOpen 에 화면좌표와 원본 이벤트를 준다(쓰는 쪽은 e.target 으로 어느 항목을 눌렀는지 더듬는다).
 */
import { useEffect, useRef } from 'react';
import { LONG_PRESS_MS } from './timing';

// 🔑 겹친 자리(틀 안의 표 안의 칸)에서 안쪽이 먼저 열었으면 바깥은 안 연다 — 이벤트 하나에 메뉴 하나(Q6).
const handled = new WeakSet<Event>();
/** 메뉴 자신(포털이지만 React 이벤트는 부모로 올라온다)에서 한 우클릭·길게 누르기는 새 메뉴를 열지 않는다 */
const inMenu = (t: Element | null) => !!t?.closest?.('[role="menu"]');

/**
 * @param skip 이 자리(예: 입력칸·글 쓰는 줄)에서는 우클릭을 가로채지 않는다 — 브라우저 기본 메뉴(맞춤법·붙여넣기)가 그대로 뜬다
 */
export function useContextTrigger(onOpen: (x: number, y: number, e: Event) => void, skip?: (target: Element) => boolean) {
    const timer = useRef<number | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);

    const clear = () => {
        if (timer.current != null) { clearTimeout(timer.current); timer.current = null; }
        start.current = null;
    };
    useEffect(() => clear, []);

    return {
        onContextMenu: (e: React.MouseEvent) => {
            if (e.defaultPrevented || handled.has(e.nativeEvent) || inMenu(e.target as Element)) return;
            if (skip && skip(e.target as Element)) return;
            e.preventDefault();
            handled.add(e.nativeEvent);
            clear();
            onOpen(e.clientX, e.clientY, e.nativeEvent);
        },
        onPointerDown: (e: React.PointerEvent) => {
            if (e.pointerType === 'mouse') return;   // 마우스는 contextmenu 가 맡는다
            if (inMenu(e.target as Element) || (skip && skip(e.target as Element))) return;
            const nat = e.nativeEvent;
            const x = e.clientX;
            const y = e.clientY;
            start.current = { x, y };
            timer.current = window.setTimeout(() => { if (!handled.has(nat)) { handled.add(nat); onOpen(x, y, nat); } clear(); }, LONG_PRESS_MS);
        },
        onPointerMove: (e: React.PointerEvent) => {
            const s = start.current;
            if (!s) return;
            if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear();   // 움직이면 스크롤/드래그다 — 취소
        },
        onPointerUp: clear,
        onPointerCancel: clear,
        onPointerLeave: clear,
    };
}
