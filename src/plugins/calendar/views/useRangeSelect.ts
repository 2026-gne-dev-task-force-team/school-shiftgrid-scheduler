/**
 * useRangeSelect — 빈 칸을 죽 끌어 범위를 고르는 포인터 제스처(쥔님 2026-11-02 *"죽 드래그 같은 것들, 모든 뷰다"*).
 *   🔴 창틀은 안 건드린다 — 달력 안에 작게 둔다(⑫ 는 layout/ 만 막는다 · 플러그인 뷰는 포인터 핸들러를 직접 들어도 된다).
 *   배럴의 useDragLeaf 는 탭/줄을 「옮기는」 물건(data-row-id·고스트)이라 결이 다르다 — 여긴 「칸을 긁는」 제스처다.
 *
 * 얼개(useDragLeaf 와 같은 포인터 규칙): idle → (down, 칸 위) → pending → (4px 넘으면) dragging.
 *   · 터치는 무시(끌기는 스크롤) · 마우스는 왼쪽 버튼만 · 일정 위에서 시작하면 선택을 시작하지 않는다(그 클릭·peek 을 살린다)
 *   · 드래그가 실제로 시작될 때만 setPointerCapture — 그 전엔 평소 클릭·더블클릭이 살아 있다
 *   · 끄는 동안 body.is-dragging(본문 글자 선택 차단은 index.css — 월·시간·년 뷰는 본문 선택을 켜 둔 자리라 이게 필요하다)
 *   · 칸 밖으로 나가면(resolve 가 null) 마지막 유효 칸을 유지한다(onExtend 를 안 부른다)
 *
 * 값(V)은 뷰가 정한다 — 월·년·간트·일정 표는 iso 문자열, 시간 그리드는 {offset, slotMin}. 칸↔값 번역은 resolve 가 한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** 포인터 아래를 풀어낸 결과 — value 가 칸 값(없으면 null), onEvent 면 일정 위(down 을 무시한다). */
export interface RangeHit<V> {
    value: V | null;
    onEvent: boolean;
}

export interface UseRangeSelectOpts<V> {
    /** 끌 수 있나(좁은 화면 등에서 끌 수 있다 — 기본 true). */
    enabled?: boolean;
    /** 뷰포트 좌표(x,y) 아래 칸을 값으로. down·move 공통(move 는 elementFromPoint 로 캡처 중에도 찾는다). */
    resolve: (x: number, y: number, phase: 'down' | 'move') => RangeHit<V>;
    /** down 에서 — 수식어 없으면 한 칸, Shift 면 anchor 에서 확장(뷰가 anchor 를 쥔다). */
    onSet: (value: V, shift: boolean) => void;
    /** 드래그 중 — anchor 에서 value 까지로 넓힌다. */
    onExtend: (value: V) => void;
    /** 드래그 시작 문턱(px) — 기본 4. */
    threshold?: number;
}

interface Internal {
    active: boolean;
    dragging: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    captureEl: HTMLElement | null;
}
function fresh(): Internal {
    return { active: false, dragging: false, pointerId: -1, startX: 0, startY: 0, captureEl: null };
}

export function useRangeSelect<V>(opts: UseRangeSelectOpts<V>) {
    const { enabled = true, resolve, onSet, onExtend, threshold = 4 } = opts;
    const [dragging, setDragging] = useState(false);
    const st = useRef<Internal>(fresh());
    // 핸들러가 매 렌더 새 함수를 받아도 bind 가 안 바뀌게 ref 로 싼다
    const resolveRef = useRef(resolve); resolveRef.current = resolve;
    const onSetRef = useRef(onSet); onSetRef.current = onSet;
    const onExtendRef = useRef(onExtend); onExtendRef.current = onExtend;

    const reset = useCallback(() => {
        const s = st.current;
        if (s.captureEl && s.pointerId >= 0) {
            try { s.captureEl.releasePointerCapture(s.pointerId); } catch { /* 이미 풀림 */ }
        }
        st.current = fresh();
        document.body.classList.remove('is-dragging');
        setDragging(false);
    }, []);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        if (!enabled) return;
        if (e.pointerType === 'touch') return;                       // 터치 끌기는 스크롤
        if (e.pointerType === 'mouse' && e.button !== 0) return;     // 왼쪽 버튼만
        const hit = resolveRef.current(e.clientX, e.clientY, 'down');
        if (hit.onEvent || hit.value == null) return;                // 일정 위·빈 곳이면 시작 안 함
        onSetRef.current(hit.value, e.shiftKey);
        const s = st.current;
        s.active = true; s.dragging = false; s.pointerId = e.pointerId;
        s.startX = e.clientX; s.startY = e.clientY;
        s.captureEl = e.currentTarget as HTMLElement;
    }, [enabled]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const s = st.current;
        if (!s.active || s.pointerId !== e.pointerId) return;
        if (!s.dragging) {
            if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < threshold) return;
            s.dragging = true;
            try { s.captureEl?.setPointerCapture(s.pointerId); } catch { /* 무시 */ }
            document.body.classList.add('is-dragging');
            setDragging(true);
        }
        e.preventDefault();
        const hit = resolveRef.current(e.clientX, e.clientY, 'move');
        if (hit.value != null) onExtendRef.current(hit.value);       // 칸 밖이면 마지막 유효 칸 유지
    }, [threshold]);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        if (st.current.pointerId !== e.pointerId) return;
        reset();
    }, [reset]);

    const onPointerCancel = useCallback(() => reset(), [reset]);

    // 언마운트 때 body 클래스·캡처 정리
    useEffect(() => () => reset(), [reset]);

    return {
        dragging,
        bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    };
}
