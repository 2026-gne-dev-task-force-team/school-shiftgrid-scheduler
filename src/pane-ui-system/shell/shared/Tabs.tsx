/**
 * 탭 줄 — 한 tabs 노드의 탭들을 그린다. 열기·닫기·전환이 실제로 돈다.
 * 각 탭은 Row 조각이다 — 닫기 ×는 revealOnHover 로, 손가락 기기에선 늘 보인다(Row 안에).
 *
 * 🔴 ⭐ 단추는 하드코딩하지 않는다 — 바깥 끝(leading/trailing)·액션 묶음(actions)을 슬롯으로 받는다.
 *    가운데는 「+새 탭·좌우 가르기」, 사이드바는 「위아래 가르기·📌·접기」로 서로 다른 단추가 들어온다.
 *    그 조립은 WorkspaceView(셸)가 하고, 여기선 자리만 잡는다.
 * 🔴 아이콘은 트리 leaf 가 정하는 게 아니라 뷰 등록소가 준다 — 여기선 받은 icon 을 그대로 그린다.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Row } from '../../primitives/Row';
import { IconButton } from '../../primitives/IconButton';
import type { DragBind } from '../../interactive/useDragLeaf';
import type { IconName } from '../../primitives/Icon';

export interface TabItem {
    id: string;
    title: string;
    /** 탭 앞 아이콘 — 뷰 등록소가 준다. 없으면 기본 네모 */
    icon?: IconName;
    /** 글자 아이콘(노드 머리에서 고른 이모지) — 있으면 icon 대신 그린다 */
    glyph?: string;
}

/** 나가는 탭(③) — 모델에선 이미 빠졌지만 폭이 줄며 사라질 때까지 DOM 에 남겨 둔다 */
type ViewTab = TabItem & { exiting?: boolean };

const prefersReduced = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * 🔴 닫히는 탭을 감싸 폭을 0 으로 줄인다(③, 쥔님 2026-11-01). 마운트 때 제 폭을 재서 그 값에서 0 으로 미끄러진다.
 *    ⛔ rAF 가 아니라 setTimeout 으로 0 을 건다 — 숨은 탭에서도 타이머는 돈다(rAF 는 멈춘다).
 *    첫 그림은 제 폭(잰 값=자연 폭)이라 튐이 없다. overflow 숨김은 .tab-collapse 가(index.css).
 */
function CollapsingTab({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<CSSProperties>({});
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const w = el.scrollWidth;
        setStyle({ maxWidth: w, opacity: 1 });
        const t = window.setTimeout(() => setStyle({ maxWidth: 0, opacity: 0 }), 20);
        return () => window.clearTimeout(t);
    }, []);
    return (
        <div ref={ref} className="tab-collapse flex items-stretch shrink-0" style={style} aria-hidden="true">
            {children}
        </div>
    );
}

export function Tabs({
    tabsId, tabs, activeId, onSelect, onClose,
    leading, trailing, actions,
    interaction, onKeyMove,
    sidebar = false,
}: {
    /** 이 탭 줄(tabs 노드)의 id — data-tabbar 로 심어, 드래그·우클릭 위임이 어느 묶음인지 더듬는다 */
    tabsId: string;
    tabs: TabItem[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    /** 바깥 왼쪽 끝 자리 — 사이드바 접기(왼쪽)·좁은 화면 왼쪽 서랍 열기 */
    leading?: ReactNode;
    /** 바깥 오른쪽 끝 자리 — 사이드바 접기(오른쪽)·좁은 화면 오른쪽 서랍 열기 */
    trailing?: ReactNode;
    /** 탭 묶음 바로 뒤 액션 묶음 — +새 탭·가르기·📌·설정 */
    actions?: ReactNode;
    /**
     * 🔴 드래그 + 우클릭/길게누르기 한 벌 — useDragLeaf 가 준 핸들러를 스크롤 줄에 그대로 얹는다(W6).
     *   둘이 따로 살면 같은 pointerdown 을 서로 가로챈다. 어느 탭인지는 data-row-id 를 훅이 더듬는다.
     */
    interaction?: DragBind;
    /** 키보드 Alt+←/→ 로 그 탭을 한 칸 옮기기 — 접근성 대안(W6 ④) */
    onKeyMove?: (leafId: string, delta: -1 | 1) => void;
    /**
     * 🔴 사이드바 탭 줄인가(판 A, 2026-11-01) — 켜지면 「사이드바답게」 다르게 그린다:
     *   탭 줄 바탕 bg-side2 · 탭은 sidetab(납작·강조 밑선) · 좁은 사이드바에 맞게 칸을 더 좁힌다.
     *   ⛔ 창틀은 「사이드바」가 무슨 뜻인지는 모른다 — 셸(WorkspaceView)이 area 로 판정해 넘긴다.
     */
    sidebar?: boolean;
}) {
    // 🔴 넘쳐서 스크롤되는 탭 줄에서 활성 탭을 늘 보이게 끌어온다(항목 11 — 새 탭/전환이 화면 밖으로 가지 않게)
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const c = scrollRef.current;
        if (!c || !activeId) return;
        const sel = (window.CSS && CSS.escape) ? CSS.escape(activeId) : activeId.replace(/"/g, '\\"');
        const el = c.querySelector<HTMLElement>(`[data-row-id="${sel}"]`);
        el?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }, [activeId, tabs.length]);

    // 🔴 ③ 나가는 탭 애니메이션 — props.tabs 가 진실이지만, 빠진 탭을 잠깐 남겨 폭이 줄며 사라지게 한다(쥔님 2026-11-01).
    //    ⭐ 재조정은 "지금 그려진 view"(cur)를 기준으로 한다 — ⛔ props 로만 새로 지으면, 중간에 끼는 다른 렌더
    //       (배치 저장 시각 갱신 등)가 진행 중인 나가는 탭을 지워 버린다(실측으로 잡은 버그). 움직임 줄이기면 즉시.
    const [view, setView] = useState<ViewTab[]>(tabs);
    const exitTimers = useRef<Map<string, number>>(new Map());
    const scheduleExit = useRef((id: string) => {
        if (exitTimers.current.has(id)) return;
        const to = window.setTimeout(() => {
            exitTimers.current.delete(id);
            setView((v) => v.filter((x) => x.id !== id));
        }, 200);                                              // .16s 전환 + 여유
        exitTimers.current.set(id, to);
    }).current;
    useEffect(() => {
        const curIds = new Set(tabs.map((t) => t.id));
        // 다시 나타난 탭은 나가기를 취소(되살아난다)
        for (const id of [...exitTimers.current.keys()]) {
            if (curIds.has(id)) { window.clearTimeout(exitTimers.current.get(id)!); exitTimers.current.delete(id); }
        }
        if (prefersReduced()) { setView(tabs.map((t) => ({ ...t }))); return; }
        setView((cur) => {
            const result: ViewTab[] = tabs.map((t) => ({ ...t }));   // 살아 있는 탭 — props 순서대로
            cur.forEach((v, i) => {
                if (curIds.has(v.id)) return;                        // 아직 살아 있음 — 위에서 넣었다
                scheduleExit(v.id);                                  // 지금 막 빠졌거나 이미 나가는 중 — 자리를 지킨다
                if (!result.some((r) => r.id === v.id)) result.splice(Math.min(i, result.length), 0, { ...v, exiting: true });
            });
            return result;
        });
    }, [tabs, scheduleExit]);
    useEffect(() => { const timers = exitTimers.current; return () => { for (const t of timers.values()) window.clearTimeout(t); }; }, []);

    return (
        // 🔴 탭 줄은 한 단 어둡다(bg-panel2) — 활성 탭만 에디터 바탕(bg-bg)이라 그 대비로 경계가 읽힌다.
        //    ⛔ 탭 줄을 에디터와 같은 색으로 두지 말 것 — 탭이 서로 붙어 보인다(쥔님 지적 2026-10-31).
        // 🔴 items-stretch — 탭이 줄 높이를 꽉 채워야 활성 탭이 몸통까지 이어진다(아래 선을 덮는다).
        //    고정 묶음(leading/actions/trailing)은 제 폭을 지키며(shrink-0) 세로 가운데로 — ⛔ 넘쳐도 안 줄어든다(항목 11).
        // 🔴 사이드바 탭 줄은 bg-side2(한 단 더 어둡다) — 가운데(bg-panel2)와 바탕부터 다르다(판 A).
        <div className={`shrink-0 flex items-stretch h-topbar border-b border-line ${sidebar ? 'bg-side2' : 'bg-panel2'}`}>
            {leading && <div className="flex items-center shrink-0 border-r border-line">{leading}</div>}

            {/* ⛔ 탭 사이 간격을 두지 않는다 — 구분은 간격이 아니라 1px 선이 한다(Row variant='tab') */}
            {/* 🔴 가운데 탭 영역만 넘치면 가로 스크롤 — 스크롤바는 얇게·호버 때만(tab-scroll, index.css) */}
            {/* 🔴 touch-pan-x: 손가락 가로 스크롤은 브라우저에 양보하고(무장 전), 세로 제스처만 드래그 판정에 쓴다 */}
            <div
                ref={scrollRef}
                data-tabbar={tabsId}
                className="flex-1 min-w-0 flex items-stretch overflow-x-auto overflow-y-hidden tab-scroll select-none touch-pan-x"
                {...interaction}
                // 🔴 가운데 클릭 = 탭 닫기(브라우저 관례). mousedown 막기는 윈도우 자동 스크롤 커서를 끈다
                onMouseDown={(e) => { if (e.button === 1 && (e.target as HTMLElement).closest('[data-row-id]')) e.preventDefault(); }}
                onAuxClick={(e) => {
                    if (e.button !== 1) return;
                    const id = (e.target as HTMLElement).closest('[data-row-id]')?.getAttribute('data-row-id');
                    if (id && tabs.some((t) => t.id === id)) { e.preventDefault(); onClose(id); }
                }}
                onKeyDown={(e) => {
                    if (!onKeyMove || !e.altKey) return;
                    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
                    if (!delta) return;
                    const el = (e.target as HTMLElement).closest('[data-row-id]');
                    const id = el?.getAttribute('data-row-id');
                    if (id) { e.preventDefault(); onKeyMove(id, delta as -1 | 1); }
                }}
            >
                {view.map((t, i) => {
                    const baseCls = sidebar ? 'min-w-0 max-w-[160px] shrink' : 'min-w-[96px] max-w-[200px] shrink-0';
                    const variant = sidebar ? 'sidetab' as const : 'tab' as const;
                    // 🔴 나가는 탭 — 폭이 줄며 사라진다. 상호작용·식별자는 뗀다(드롭이 사라지는 탭을 겨냥하지 않게)
                    if (t.exiting) {
                        return (
                            <CollapsingTab key={t.id}>
                                <Row icon={t.icon ?? 'table'} glyph={t.glyph} label={t.title} active={false} variant={variant} className={baseCls} title={t.title} />
                            </CollapsingTab>
                        );
                    }
                    const isActive = t.id === activeId;
                    // 세로 구분선은 「둘 다 비활성」일 때만 — 다음 "살아 있는" 탭을 기준으로(나가는 탭은 건너뛴다)
                    const nextLive = view.slice(i + 1).find((v) => !v.exiting);
                    const sep = !isActive && nextLive != null && nextLive.id !== activeId;
                    return (
                        <Row
                            key={t.id}
                            rowId={t.id}
                            icon={t.icon ?? 'table'}
                            glyph={t.glyph}
                            label={t.title}
                            active={isActive}
                            sep={sep}
                            onClick={() => onSelect(t.id)}
                            title={t.title}
                            // 사이드바 탭은 더 좁다(아이콘 + 짧은 글자) · 가운데 탭은 넉넉한 고정 폭 · tab-in: 열릴 때 떠오른다(③)
                            className={`${baseCls} tab-in`}
                            variant={variant}
                            revealOnHover
                            end={
                                <IconButton
                                    icon="x"
                                    label={`${t.title} 닫기`}
                                    size={13}
                                    className="w-5 h-5"
                                    onClick={(e: MouseEvent) => { e.stopPropagation(); onClose(t.id); }}
                                />
                            }
                        />
                    );
                })}
            </div>

            {actions && <div className="flex items-center gap-1 px-pad shrink-0 border-l border-line">{actions}</div>}
            {trailing && <div className="flex items-center shrink-0 border-l border-line">{trailing}</div>}
        </div>
    );
}
