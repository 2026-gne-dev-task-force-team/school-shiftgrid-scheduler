/**
 * leaf 몸통 자리 — 활성 leaf 하나를 뷰 등록소로 그린다. 등록 안 된 viewId 면 이름만 옅게.
 * leaf 가 없으면(빈 묶음) 빈 상태 한 줄.
 * 🔴 창틀은 viewId 가 무엇인지 모른다 — 등록소에서 받은 Component 를 그릴 뿐이다.
 *
 * ⭐ 2026-11-01(W4): 제 칸의 크기를 재서 뷰에게 width·height·collapsed 로 넘긴다.
 *    - squeeze='collapse' + 폭이 collapseBelow 아래 → collapsed=true (뷰가 접힌 그림을 그린다, 설정창이 첫 손님)
 *    - squeeze='scroll' → 넘치면 스크롤 · 그 외 → 넘침 숨김(찌그러짐/접힘은 뷰가 collapsed 로 처리)
 *    유효 레이아웃 = 등록값 + 설정 덮어쓰기(effectiveViewLayout) — 설정이 바뀌면 usePaneSettings 로 다시 그린다.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { Leaf } from '../layout/tree';
import { getView } from '../view-registry';
import { effectiveViewLayout, usePaneSettings } from '../layout/pane-settings';
import { isCollapsed } from '../layout/clamp';

/** 제 요소의 폭·높이(px) — ResizeObserver 로 바뀔 때만 깨운다 */
function useElementSize() {
    const ref = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        // 🔴 ResizeObserver 초기 콜백을 못 믿는 환경이 있다 — 마운트 때 한 번은 동기로 잰다(레이아웃 강제)
        const measure = () => {
            const r = el.getBoundingClientRect();
            setSize((prev) => (prev.width === Math.round(r.width) && prev.height === Math.round(r.height)
                ? prev : { width: Math.round(r.width), height: Math.round(r.height) }));
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => measure());
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, size] as const;
}

export function EditorArea({ leaf }: { leaf: Leaf | null }) {
    const [ref, size] = useElementSize();
    usePaneSettings();   // 뷰 덮어쓰기가 바뀌면 접힘 기준이 바뀐다 → 다시 그린다

    if (!leaf) {
        return (
            <div className="flex-1 min-h-0 grid place-items-center bg-bg overflow-hidden px-8 py-6 text-center">
                <p className="max-w-[18rem] text-[13px] text-muted/80 select-none leading-relaxed text-balance">열린 탭이 없습니다. 위 + 로 새 탭을 엽니다.</p>
            </div>
        );
    }
    const def = getView(leaf.viewId);
    if (!def) {
        return (
            <div className="flex-1 min-h-0 grid place-items-center bg-bg overflow-hidden px-6 text-center">
                <p className="text-2xl font-light text-muted/50 select-none truncate max-w-full">{leaf.title}</p>
            </div>
        );
    }
    const Body = def.Component;
    const layout = effectiveViewLayout(leaf.viewId);
    const collapsed = isCollapsed(layout, size.width);
    // squeeze='scroll' 인 뷰(표)는 좁아지면 스크롤 · 그 외는 넘침을 숨긴다
    const overflow = layout.squeeze === 'scroll' ? 'overflow-auto' : 'overflow-hidden';
    // 🔴 뷰 본문은 글자 선택이 돼야 한다(select-text) — 창틀 크롬만 드래그·선택을 막는다(항목 9 예외)
    return (
        <div ref={ref} className={`flex-1 min-h-0 ${overflow} bg-bg select-text`}>
            <Body leaf={leaf} width={size.width} height={size.height} collapsed={collapsed} />
        </div>
    );
}
