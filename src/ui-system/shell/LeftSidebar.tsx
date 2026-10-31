/**
 * 왼쪽 사이드바 — 위·아래 두 칸. 각 칸은 머리(SectionHeader) + 빈 몸통.
 * 경계를 끌어 높이 비율(leftSplit)을 바꾼다. ⛔ 칸 접기는 없다 — 쥔님 판정(SectionHeader 주석 참조).
 * 🔴 기능 0 — 몸통은 내용 없는 빈칸이다. 색·px 는 안쪽 조각(Surface 등)이 쥔다.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SectionHeader } from '../primitives/SectionHeader';
import { splitFromDrag } from '../layout/panels';

interface Section {
    title: string;
    /** 끝단 액션 자리 — 패널마다 다르다. 안 주면 아무것도 안 뜬다 */
    actions?: ReactNode;
}

export function LeftSidebar({
    top, bottom, split, onSplit,
}: {
    top: Section;
    bottom: Section;
    split: number;      // 위 칸이 차지하는 몫 (0~1)
    onSplit: (v: number) => void;
}) {
    const rootRef = useRef<HTMLDivElement>(null);

    return (
        <div ref={rootRef} className="flex flex-col h-full min-h-0">
            {/* 위 칸 */}
            <section
                className="flex flex-col min-h-0"
                style={{ flexBasis: `${split * 100}%`, flexGrow: 0, flexShrink: 1 }}
            >
                <SectionHeader title={top.title} end={top.actions} />
                {/* 🔴 빈 몸통은 정말 비워 둔다 — 여백도 테두리 상자도 두지 않는다.
                    내용 없는 자리에 상자를 그리면 그게 「베젤」로 보인다(2026-10-31 쥔님 지적). */}
                <div className="flex-1 min-h-0 overflow-auto" />
            </section>

            {/* 세로 분할 손잡이 */}
            <VSplitHandle rootRef={rootRef} split={split} onSplit={onSplit} />

            {/* 아래 칸 */}
            {/* 🔴 위 칸과 갈리는 선 — 헤더 위에 선이 없으면 앞 칸 몸통과 붙어 보인다(쥔님 지적 22:23).
                스플리터는 평소 투명이라 경계 노릇을 못 한다 — 선은 따로 긋는다 */}
            <section className="flex flex-col min-h-0 border-t border-line" style={{ flex: '1 1 0%' }}>
                <SectionHeader title={bottom.title} end={bottom.actions} />
                <div className="flex-1 min-h-0 overflow-auto" />
            </section>
        </div>
    );
}

function VSplitHandle({
    rootRef, split, onSplit,
}: { rootRef: React.RefObject<HTMLDivElement | null>; split: number; onSplit: (v: number) => void }) {
    const [dragging, setDragging] = useState(false);
    const start = useRef<{ y: number; split: number; h: number } | null>(null);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        const h = rootRef.current?.getBoundingClientRect().height ?? 0;
        start.current = { y: e.clientY, split, h };
        setDragging(true);
    }, [rootRef, split]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const s = start.current;
        if (!s) return;
        onSplit(splitFromDrag(s.split, e.clientY - s.y, s.h));
    }, [onSplit]);

    const end = useCallback(() => { start.current = null; setDragging(false); }, []);

    useEffect(() => {
        if (!dragging) return;
        const prev = document.body.style.cursor;
        document.body.style.cursor = 'row-resize';
        document.body.classList.add('select-none');
        return () => { document.body.style.cursor = prev; document.body.classList.remove('select-none'); };
    }, [dragging]);

    return (
        <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="두 칸 높이 조절"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => {
                const h = rootRef.current?.getBoundingClientRect().height ?? 0;
                if (e.key === 'ArrowUp') { e.preventDefault(); onSplit(splitFromDrag(split, -16, h)); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); onSplit(splitFromDrag(split, 16, h)); }
            }}
            title="끌어서 두 칸 높이 조절"
            className="resize-handle relative h-2 -my-1 cursor-row-resize z-10 touch-none shrink-0"
        >
            <div className={`resize-bar absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px ${dragging ? 'is-dragging' : ''}`} />
        </div>
    );
}
