/**
 * 항목 하나를 잡아 끄는 상태 머신 — 🔴 ⭐ 「무엇이 드래그인가」와 「무엇이 우클릭인가」를 한 훅에 합친다.
 *   둘이 따로 살면 같은 pointerdown 을 두 판정이 서로 가로챈다(쥔님 지시의 핵심) — 그래서 여기 한 곳이다.
 *
 * 상태: idle → pending(눌림) → (armed, 손가락만) → dragging → drop|cancel
 *   - 마우스: 왼쪽 버튼으로 8px 움직이면 바로 드래그 · 오른쪽 버튼은 contextmenu → 메뉴
 *   - 손가락/펜: 350ms 길게 눌러야 「무장」(그 전 10px 넘게 움직이면 스크롤로 보고 포기 — 브라우저가 스크롤).
 *     무장 뒤 움직이면 드래그, 안 움직이고 떼면 메뉴.
 *   - Esc 로 취소 · 끄는 동안 body.is-dragging(본문 선택·스크롤 차단은 index.css)
 *
 * ⭐ axis(2026-11-01 W8) — 이 훅은 가로 탭 줄과 세로 아이콘 띠(리본) 둘 다에 얹힌다.
 *    판정 문턱(8px·10px)은 등방(어느 방향이든 같다)이라 축과 무관하고, axis 는 「어느 방향 리스트냐」를
 *    drag 상태에 실어 쓰는 쪽에 알려 준다(쓰는 쪽이 드롭 미리보기를 가로선/세로선 중 맞게 그린다).
 *    ⛔ 새 드래그 훅을 또 짜지 말 것 — 세로 리스트도 이 한 훅을 쓴다.
 *
 * ⛔ setPointerCapture 는 「드래그가 실제로 시작될 때」만 건다 — 그 전엔 평소 스크롤·클릭이 살아 있어야 한다.
 * ⛔ 트리도 DOM 존도 모른다 — 포인터를 뗀 자리(x,y)만 onDrop 에 넘기고, 어느 존인지 번역은 쓰는 쪽이 한다.
 * ⛔ 이 판정을 다른 데로 복사하지 말 것(useContextTrigger 와 같은 규칙) — 각 리스트는 이 훅 하나만 얹는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** 세로/가로 리스트 방향 — 드롭 미리보기 선 방향을 쓰는 쪽이 고를 때 쓴다 */
export type DragAxis = 'x' | 'y';

/** 끄는 동안의 고스트·존 그리기에 필요한 최소 정보 */
export interface DragLeafState {
    leafId: string;
    title: string;
    /** 포인터 현재 위치(뷰포트 좌표) */
    x: number;
    y: number;
    /** 고스트 카드 폭 — 잡은 항목의 폭(px) */
    width: number;
    /** 이 리스트가 가로(x)냐 세로(y)냐 — 드롭 미리보기 방향용 */
    axis: DragAxis;
}

export interface UseDragLeafOpts {
    /** 좁은 화면 등에서 드래그·길게누르기를 통째로 끈다(쥔님: 모바일은 스플릿 안 함) */
    enabled: boolean;
    /** 가로 탭 줄이면 'x'(기본) · 세로 아이콘 띠면 'y'. 판정 문턱은 등방이라 이건 미리보기 방향용 */
    axis?: DragAxis;
    /** 우클릭(마우스) · 길게 눌러 안 움직이고 뗌(손가락) → 그 탭/줄의 메뉴. el 로 어느 탭인지 더듬는다 */
    onContext: (x: number, y: number, el: HTMLElement) => void;
    /** 드롭 — 포인터를 뗀 자리. 어느 존(탭 사이/가장자리/빈 면)인지 번역은 쓰는 쪽이 한다 */
    onDrop: (leafId: string, x: number, y: number) => void;
}

const MOUSE_START = 8;    // 마우스: 8px 움직이면 드래그 시작
const TOUCH_HOLD = 350;   // 손가락: 350ms 길게 눌러야 무장
const TOUCH_CANCEL = 10;  // 손가락: 무장 전 10px 넘게 움직이면 스크롤 — 포기

type Phase = 'idle' | 'pending' | 'armed' | 'dragging';

interface Internal {
    phase: Phase;
    pointerId: number;
    pointerType: string;
    leafId: string | null;
    startX: number;
    startY: number;
    title: string;
    width: number;
    captureEl: HTMLElement | null;
    timer: number | null;
}

function freshState(): Internal {
    return {
        phase: 'idle', pointerId: -1, pointerType: '', leafId: null,
        startX: 0, startY: 0, title: '', width: 0, captureEl: null, timer: null,
    };
}

export function useDragLeaf(opts: UseDragLeafOpts) {
    const { enabled, onContext, onDrop, axis = 'x' } = opts;
    const [drag, setDrag] = useState<DragLeafState | null>(null);
    const st = useRef<Internal>(freshState());

    const clearTimer = useCallback(() => {
        if (st.current.timer != null) { clearTimeout(st.current.timer); st.current.timer = null; }
    }, []);

    // 🔴 마우스 pending 동안만 window 에서 움직임을 본다 — 리스트(탭 줄) 위 pointermove 만 보면, 8px 넘기 전에
    //    포인터가 줄 밖으로 나가는 빠른 끌기(탭 줄 높이 32px · 한 프레임 20px+)는 드래그가 영영 시작 안 된다
    //    (2026-11-08 쥔님 「탭 끌어서 스플릿 안 됨」 실측 원인). capture 는 여전히 시작 순간에만 건다(클릭 보존).
    const detachWin = useRef<(() => void) | null>(null);
    const detachWindow = useCallback(() => { detachWin.current?.(); detachWin.current = null; }, []);

    const reset = useCallback(() => {
        detachWindow();
        const s = st.current;
        if (s.timer != null) { clearTimeout(s.timer); }
        if (s.captureEl && s.pointerId >= 0) {
            try { s.captureEl.releasePointerCapture(s.pointerId); } catch { /* 이미 풀림 */ }
        }
        st.current = freshState();
        document.body.classList.remove('is-dragging');
        setDrag(null);
    }, [detachWindow]);

    const startDrag = useCallback((x: number, y: number) => {
        const s = st.current;
        if (!s.leafId || !s.captureEl) { reset(); return; }
        clearTimer();
        detachWindow();
        try { s.captureEl.setPointerCapture(s.pointerId); } catch { /* 무시 */ }
        s.phase = 'dragging';
        document.body.classList.add('is-dragging');
        setDrag({ leafId: s.leafId, title: s.title, x, y, width: s.width, axis });
    }, [reset, clearTimer, detachWindow, axis]);

    const onContextMenu = useCallback((e: React.MouseEvent) => {
        if (!enabled) return;
        e.preventDefault();
        const el = e.target as HTMLElement;
        reset();
        onContext(e.clientX, e.clientY, el);
    }, [enabled, onContext, reset]);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        if (!enabled) return;
        const tgt = e.target as HTMLElement;
        const tabEl = tgt.closest('[data-row-id]') as HTMLElement | null;
        // 🔴 「드래그되면 곤란한 것」 — × 닫기 등 "항목 안의 다른 단추" 위에서 시작하면 드래그 안 한다(그 클릭을 살린다).
        //    ⭐ 단 항목 자신이 단추인 경우(리본 아이콘)는 끌 수 있어야 한다 — 그래서 "항목과 다른 단추" 일 때만 포기한다.
        const btn = tgt.closest('button');
        if (btn && btn !== tabEl) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;   // 왼쪽 버튼만(오른쪽은 contextmenu)

        clearTimer();
        const s = st.current;
        s.phase = 'pending';
        s.pointerId = e.pointerId;
        s.pointerType = e.pointerType;
        s.leafId = tabEl?.getAttribute('data-row-id') ?? null;
        s.startX = e.clientX;
        s.startY = e.clientY;
        s.captureEl = e.currentTarget as HTMLElement;
        if (tabEl) {
            const r = tabEl.getBoundingClientRect();
            s.width = r.width;
            s.title = tabEl.getAttribute('title') ?? tabEl.textContent ?? '';
        }
        if (e.pointerType === 'mouse' && s.leafId) {
            detachWindow();
            const pid = e.pointerId;
            const onWinMove = (ev: PointerEvent) => {
                const c = st.current;
                if (c.phase !== 'pending' || ev.pointerId !== pid) return;
                if (Math.hypot(ev.clientX - c.startX, ev.clientY - c.startY) > MOUSE_START) startDrag(ev.clientX, ev.clientY);
            };
            // 줄 밖에서 뗀 클릭 — 리스트의 onPointerUp 이 못 받으니 여기서 pending 을 푼다
            const onWinUp = (ev: PointerEvent) => {
                if (ev.pointerId === pid && st.current.phase === 'pending') reset();
            };
            window.addEventListener('pointermove', onWinMove);
            window.addEventListener('pointerup', onWinUp);
            detachWin.current = () => {
                window.removeEventListener('pointermove', onWinMove);
                window.removeEventListener('pointerup', onWinUp);
            };
        }
        if (e.pointerType !== 'mouse') {
            // 손가락/펜: 350ms 안 움직이면 무장(그동안의 10px 판정은 onPointerMove)
            s.timer = window.setTimeout(() => {
                if (st.current.phase !== 'pending') return;
                st.current.phase = 'armed';
                try { navigator.vibrate?.(10); } catch { /* 지원 안 함 */ }
            }, TOUCH_HOLD);
        }
    }, [enabled, clearTimer, detachWindow, startDrag, reset]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const s = st.current;
        if (s.phase === 'idle' || s.pointerId !== e.pointerId) return;
        if (s.phase === 'dragging') {
            e.preventDefault();
            setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
            return;
        }
        const dist = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
        if (s.pointerType === 'mouse') {
            if (s.leafId && dist > MOUSE_START) startDrag(e.clientX, e.clientY);
            return;
        }
        // 손가락/펜
        if (s.phase === 'pending') {
            if (dist > TOUCH_CANCEL) reset();              // 무장 전 움직임 = 스크롤 — 포기
        } else if (s.phase === 'armed') {
            if (s.leafId) startDrag(e.clientX, e.clientY);  // 무장 뒤 움직임 = 드래그
            else reset();
        }
    }, [startDrag, reset]);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        const s = st.current;
        if (s.phase === 'idle') return;
        if (s.phase === 'dragging') {
            const id = s.leafId!;
            reset();
            onDrop(id, e.clientX, e.clientY);
            return;
        }
        // 손가락: 무장했는데 안 움직이고 뗌 → 메뉴
        if (s.phase === 'armed' && s.pointerType !== 'mouse') {
            const x = e.clientX, y = e.clientY;
            const el = e.target as HTMLElement;
            reset();
            onContext(x, y, el);
            return;
        }
        reset();   // pending 에서 뗌 = 보통 클릭(Row onClick 이 맡는다)
    }, [onDrop, onContext, reset]);

    const onPointerCancel = useCallback(() => { reset(); }, [reset]);

    // Esc 로 드래그 취소(드롭 안 함) + 언마운트 때 타이머 정리
    useEffect(() => {
        if (!drag) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') reset(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [drag, reset]);
    useEffect(() => () => { clearTimer(); detachWindow(); }, [clearTimer, detachWindow]);

    const bind = { onContextMenu, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
    return { bind, drag };
}

export type DragBind = ReturnType<typeof useDragLeaf>['bind'];
