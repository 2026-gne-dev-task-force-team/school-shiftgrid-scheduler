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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Leaf } from '../../layout/tree';
import { getView, type PeekHandle } from '../../view-registry';
import { effectiveViewLayout, usePaneSettings } from '../../layout/pane-settings';
import { isCollapsed } from '../../layout/clamp';
import { ViewPlaceholder } from '../../plugin/Placeholder';
import { usePluginRegistry } from '../../plugin/registry';
import { PeekLayer } from './PeekLayer';

const PEEK_WIDE_MIN_DEFAULT = 420;   // 뷰가 wideMin 을 안 주면 이 폭 이상을 「넓다」로 본다

/**
 * 제 요소의 폭·높이(px) — ResizeObserver 로 바뀔 때만 깨운다.
 *
 * 🔴 ⭐ 콜백 ref 다(useRef + useLayoutEffect 아님). 사유 — 이 칸은 **빈 상태일 때 ref 가 붙은 몸통을 안 그린다**:
 *    열린 탭이 없으면 「열린 탭이 없습니다」 한 줄, 등록 안 된 뷰면 자리표시가 대신 뜬다.
 *    effect 가 `[]` 로 한 번만 돌던 옛 판은 그때 `ref.current` 가 null 이라 **관찰을 영영 안 붙였고**,
 *    나중에 탭이 생겨도 폭이 0 에 멈춰 `isCollapsed(…, 0)` 이 참이 됐다
 *    → 넓은 화면인데 설정이 아이콘만으로 접혔다(쥔님 2026-11-01 15:26 「설정 플러그인 목록 레이아웃 깨짐」).
 *    콜백 ref 는 **몸통이 붙고 떨어질 때마다** 불려서 그 구멍이 구조적으로 안 생긴다.
 */
function useElementSize() {
    const [size, setSize] = useState({ width: 0, height: 0 });
    const roRef = useRef<ResizeObserver | null>(null);
    const ref = useCallback((el: HTMLDivElement | null) => {
        roRef.current?.disconnect();
        roRef.current = null;
        if (!el) return;
        // 🔴 ResizeObserver 초기 콜백을 못 믿는 환경이 있다 — 붙는 순간 한 번은 동기로 잰다(레이아웃 강제)
        const measure = () => {
            const r = el.getBoundingClientRect();
            setSize((prev) => (prev.width === Math.round(r.width) && prev.height === Math.round(r.height)
                ? prev : { width: Math.round(r.width), height: Math.round(r.height) }));
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => measure());
        ro.observe(el);
        roRef.current = ro;
    }, []);
    return [ref, size] as const;
}

export function EditorArea({ leaf, sidebar = false }: { leaf: Leaf | null; sidebar?: boolean }) {
    const [ref, size] = useElementSize();
    usePaneSettings();       // 뷰 덮어쓰기가 바뀌면 접힘 기준이 바뀐다 → 다시 그린다
    usePluginRegistry();     // 🔴 플러그인을 끄고 켜면 이 뷰가 등록소에서 빠지거나 돌아온다 → 다시 그린다(자리표시 전환)

    // 🔴 피크(미리보기) — 이 칸(leaf)에 겹쳐 뜨는 상태. 뷰가 ViewProps.peek 으로 띄운다.
    //    ⭐ 이 칸의 leaf 가 바뀌면(탭 전환) 피크는 닫는다 — 옛 leaf 의 피크가 새 leaf 에 새지 않게.
    const [peek, setPeek] = useState<{ node: ReactNode; wideMin: number } | null>(null);
    const showPeek = useCallback((node: ReactNode, opts?: { wideMin?: number }) => {
        setPeek({ node, wideMin: opts?.wideMin ?? PEEK_WIDE_MIN_DEFAULT });
    }, []);
    const hidePeek = useCallback(() => setPeek(null), []);
    const leafId = leaf?.id ?? null;
    useEffect(() => { setPeek(null); }, [leafId]);
    const peekHandle: PeekHandle = { show: showPeek, hide: hidePeek, visible: peek != null };

    // 🔴 사이드바 몸통은 bg-side(에디터 bg 보다 한 단 어둡다) — 가운데(bg-bg)와 갈려야 「사이드답게」 보인다(판 A).
    const surface = sidebar ? 'bg-side' : 'bg-bg';

    if (!leaf) {
        return (
            <div className={`flex-1 min-h-0 grid place-items-center ${surface} overflow-hidden px-8 py-6 text-center`}>
                <p className="max-w-[18rem] text-[13px] text-muted/80 select-none leading-relaxed text-balance">열린 탭이 없습니다. 위 + 로 새 탭을 엽니다.</p>
            </div>
        );
    }
    const def = getView(leaf.viewId);
    if (!def) {
        // 🔴 등록 안 된 viewId — 꺼진 플러그인이면 「켜기」 자리표시, 정말 모르면 제목만 옅게(ViewPlaceholder 가 가른다)
        return <ViewPlaceholder leaf={leaf} surface={surface} />;
    }
    const Body = def.Component;
    const layout = effectiveViewLayout(leaf.viewId);
    const collapsed = isCollapsed(layout, size.width);
    // squeeze='scroll' 인 뷰(표)는 좁아지면 스크롤 · 그 외는 넘침을 숨긴다
    const overflow = layout.squeeze === 'scroll' ? 'overflow-auto' : 'overflow-hidden';
    // 🔴 뷰 본문은 글자 선택이 돼야 한다(select-text) — 창틀 크롬만 드래그·선택을 막는다(항목 9 예외)
    // 🔴 ③ 탭 전환 — 활성 몸통이 바뀔 때 짧은 페이드(leaf id 로 키잉, 쥔님 2026-11-01). ⚠️ 입력칸에서 깜빡이면 뺀다.
    //    키가 바뀌면 그 뷰가 다시 마운트되며 .view-fade 가 한 번 돈다(움직임 줄이기면 즉시).
    // 🔴 겉은 relative(피크를 이 칸에 가둔다) · 안쪽 몸통 층이 스크롤을 쥔다 · 피크는 그 위에 겹친다.
    //    피크는 absolute inset-0 라 탭 줄 아래 「내용 위」에만 뜬다(탭 줄·머리줄과 높이를 안 맞춘다).
    //    넓음/좁음은 **이 칸 폭**(size.width) 으로 가른다 — 창 폭이 아니다(쥔님).
    const peekWide = size.width >= (peek?.wideMin ?? PEEK_WIDE_MIN_DEFAULT);
    return (
        <div ref={ref} data-pane-w={size.width} data-pane-collapsed={String(collapsed)} className={`relative flex-1 min-h-0 ${surface}`}>
            <div className={`absolute inset-0 ${overflow} select-text`}>
                <div key={leaf.id} className="view-fade h-full min-h-0">
                    <Body leaf={leaf} width={size.width} height={size.height} collapsed={collapsed} peek={peekHandle} />
                </div>
            </div>
            {peek && <PeekLayer wide={peekWide} onClose={hidePeek}>{peek.node}</PeekLayer>}
        </div>
    );
}
