/**
 * 왼쪽 아이콘 레일(리본) — 사이드바 "바깥 왼쪽" 세로 띠. 폭은 치수 토큰(--s-rail).
 *
 * 🔴 ⛔ 여기는 「앱 리본」이다 — 앱 기능(명령)·동작 아이콘이 사는 자리다(쥔님: *"엑셀 상단 리본처럼"*).
 *    ⛔ 사이드바 접기/펴기 아이콘을 여기 두지 말 것 (쥔님 판정 2026-10-31 22:12).
 *    사이드바를 접고 펴는 길은 이미 둘이다 — 폭 손잡이 두 번 누르기 · 가운데 탭 줄 끝의 ◧/◨.
 *
 * ⭐ 2026-11-01: 리본에는 **host.ribbon.add 로 명시해 꽂은 것만** 선다(동작). ⛔ 그냥 등록만 한 뷰는 안 뜬다
 *    (쥔님 2026-11-01: *"리본에 요청 안 한 아이콘이 서 있다"* — 뷰 자동 줄 세우기를 뺐다). 「설정」만 맨 아래 고정.
 * ⭐ 2026-11-01(W8·항목 I): 아이콘을 끌어 순서를 바꾸고(useReorder 공용 훅), 우클릭으로 끄고 다시 켠다.
 *    ⛔ 드래그·재배열 판정은 interactive/ 한 곳만 쓴다 — 여기선 미리보기 선·고스트·메뉴만 그린다.
 * 🔴 색은 토큰으로만.
 */
import { useCallback, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '../../primitives/IconButton';
import { ContextMenu, type MenuEntry } from '../../primitives/ContextMenu';
import { useReorder } from '../../interactive/useReorder';
import {
    usePaneSettings, setRibbonOrder, toggleRibbonHidden, resetRibbon,
} from '../../layout/pane-settings';
import { resolveRibbonEntries, useContribVersion } from '../../plugin';

export function Rail({
    onOpenView, onOpenSettings, orientation = 'vertical',
}: {
    /** 리본 아이콘을 눌렀을 때 — 그 뷰를 defaultArea 에 연다(앱이 정한다) */
    onOpenView: (viewId: string) => void;
    onOpenSettings: () => void;
    /**
     * 🔴 'vertical'(기본) 은 왼쪽 세로 띠(옵시디언) · 'horizontal' 은 상단 가로 줄(엑셀 리본).
     *    쥔님 2026-11-01 13:39: *"엑셀 쓰는 사람들은 아이콘이 상단에 있는 게 익숙할 수도 — 옵션으로"*. 같은 목록·같은 드래그.
     */
    orientation?: 'vertical' | 'horizontal';
}) {
    const horizontal = orientation === 'horizontal';
    const { ribbon } = usePaneSettings();
    useContribVersion();   // 🔴 리본 동작이 바뀌면(플러그인 켜고 끄기) 다시 그린다
    // 🔴 host.ribbon.add 로 꽂은 동작만 — order·hidden(기기별 배치)에 태운다
    const { visible, hidden, ordered } = resolveRibbonEntries(ribbon);
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);

    // 🔴 우클릭/길게누르기 → 그 아이콘 메뉴(숨기기·숨긴 것 되살리기·기본 순서). el 로 어느 아이콘인지 더듬는다
    const onContext = useCallback((x: number, y: number, el: HTMLElement) => {
        const id = el.closest('[data-row-id]')?.getAttribute('data-row-id') ?? null;
        const items: MenuEntry[] = [];
        if (id) {
            items.push({ label: '이 아이콘 숨기기', icon: 'ban', onClick: () => toggleRibbonHidden(id, true) });
            items.push({ sep: true });
        }
        if (hidden.length > 0) {
            items.push({ label: '숨긴 아이콘 — 눌러 다시 켜기', disabled: true });
            for (const h of hidden) {
                items.push({ label: h.title, icon: h.icon ?? 'dot', onClick: () => toggleRibbonHidden(h.id, false) });
            }
        } else {
            items.push({ label: '숨긴 아이콘 없음', disabled: true });
        }
        items.push({ sep: true });
        items.push({ label: '기본 순서로', icon: 'undo', onClick: () => resetRibbon() });
        setMenu({ x, y, items });
    }, [hidden]);

    // 🔴 순서 바꾸기는 공용 훅 하나 — 리본·설정·탭이 같은 interactive/useReorder 를 쓴다(쥔님 ⑨)
    const { containerRef, bind, drag, indicator, draggedRef, onKeyDown } = useReorder({
        ids: ordered.map((v) => v.id),
        axis: horizontal ? 'x' : 'y',
        onReorder: setRibbonOrder,
        onContext,
    });

    // ⭐ 리본 안에서만 아이콘 버튼이 커진다 — --s-btn 을 리본 값으로 바꿔치기한다(옵시디언 눈금).
    return (
        <nav
            ref={containerRef}
            className={horizontal
                ? 'shrink-0 w-full h-rail bg-panel border-b border-line flex flex-row items-center px-2 gap-1'
                : 'shrink-0 w-rail bg-panel border-r border-line flex flex-col items-center py-2 gap-1'}
            style={{ '--s-btn': 'var(--s-railbtn)' } as CSSProperties}
            onPointerDownCapture={() => { draggedRef.current = false; }}
            onKeyDown={onKeyDown}
            {...bind}
        >
            {/* 위: 리본 동작(숨긴 것 제외) — 아이콘·순서는 등록+기기 배치가 준다. 끌어 재배치 가능 */}
            {visible.map((v) => (
                <IconButton
                    key={v.id}
                    rowId={v.id}
                    icon={v.icon ?? 'dot'}
                    label={v.title}
                    size={18}
                    data={{ 'data-ribbon-kind': v.kind }}
                    onClick={() => {
                        if (draggedRef.current) { draggedRef.current = false; return; }
                        // 🔴 동작은 명령을 부른다(run) · 뷰는 바깥이 연다(onOpenView). 창틀은 그 뜻을 모른다
                        if (v.kind === 'action') v.run?.(); else onOpenView(v.id);
                    }}
                />
            ))}

            {/* 가운데는 비워 둔다 — 나중에 명령 아이콘이 더 쌓일 자리 */}
            <div className="flex-1" />

            {/* 맨 아래 고정: 설정 (⛔ 리본 재배치 대상 아님 — data-row-id 없음) */}
            <IconButton icon="gear" label="설정 열기" size={18} onClick={onOpenSettings} />

            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

            {/* 드래그 오버레이 — 드롭 선 + 포인터 따라다니는 고스트. pointer-events:none 로 아래 DOM 을 뚫는다 */}
            {drag && createPortal(
                <div className="ui-chrome-nodrag fixed inset-0 z-[60] pointer-events-none">
                    {indicator && (
                        <div
                            className="absolute bg-accent rounded-full"
                            style={horizontal
                                ? { left: indicator.line - 1.5, top: indicator.cross + 2, width: 3, height: indicator.size - 4 }
                                : { left: indicator.cross + 2, top: indicator.line - 1.5, width: indicator.size - 4, height: 3 }}
                        />
                    )}
                    <div
                        className="absolute flex items-center rounded-md border border-line bg-panel2 text-text text-[13px] px-3 h-topbar shadow-lg opacity-90 truncate"
                        style={{ left: drag.x + 12, top: drag.y + 12, maxWidth: 220 }}
                    >
                        <span className="truncate">{drag.title}</span>
                    </div>
                </div>,
                document.body,
            )}
        </nav>
    );
}
