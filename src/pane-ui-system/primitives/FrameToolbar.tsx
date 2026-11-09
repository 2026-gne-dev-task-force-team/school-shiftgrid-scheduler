/**
 * Frame 툴바 자리 — 「Frame 이 머리 아래 툴바 자리를 주고, 안쪽 화면(표·목록·달력)이 제 도구 막대를 그 자리에 꽂는」 꼴 한 벌.
 *   옛 꼴(5곳이 손으로): const [barHost, setBarHost] = useState(null); <Frame toolbar={<div ref={setBarHost}/>}> … toolbarHost={barHost}
 *   새 꼴:
 *     const bar = useFrameToolbar();
 *     <Frame toolbar={bar.slot}> … <Child toolbarHost={bar.host} /> 또는 <bar.Portal>{막대}</bar.Portal>
 *   Portal 은 자리가 아직 없으면(첫 그림·Frame 이 없는 화면) 제자리에 그린다(inline) — fallback="none" 이면 안 그린다.
 */
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** 자리가 있으면 그리로 포털, 없으면 제자리(또는 안 그림) */
export function FrameToolbarPortal({ host, children, fallback = 'inline' }: {
    host: HTMLElement | null | undefined;
    children: ReactNode;
    fallback?: 'inline' | 'none';
}) {
    if (host) return createPortal(children, host);
    return fallback === 'inline' ? <>{children}</> : null;
}

export interface FrameToolbar {
    /** Frame 의 toolbar 자리에 넘길 빈 칸 */
    slot: ReactElement;
    /** 그 칸의 DOM — 자식에게 toolbarHost 로 넘긴다(아직 없으면 null) */
    host: HTMLElement | null;
    /** host 가 묶인 포털 */
    Portal: (p: { children: ReactNode; fallback?: 'inline' | 'none' }) => ReactNode;
}

export function useFrameToolbar(): FrameToolbar {
    const [host, setHost] = useState<HTMLElement | null>(null);
    const ref = useCallback((el: HTMLDivElement | null) => setHost(el), []);
    const slot = useMemo(() => <div ref={ref} data-frame-toolbar />, [ref]);
    const Portal = useCallback(
        ({ children, fallback }: { children: ReactNode; fallback?: 'inline' | 'none' }) =>
            <FrameToolbarPortal host={host} fallback={fallback}>{children}</FrameToolbarPortal>,
        [host],
    );
    return { slot, host, Portal };
}
