/**
 * 왼쪽 아이콘 레일(리본) — 사이드바 "바깥 왼쪽" 세로 띠. 폭은 치수 토큰(--s-rail).
 *
 * 🔴 ⛔ 여기는 「앱 리본」이다 — 앱 기능(명령)·동작 아이콘이 사는 자리다(쥔님: *"엑셀 상단 리본처럼"*).
 *    ⛔ 사이드바 접기/펴기 아이콘을 여기 두지 말 것 (쥔님 판정 2026-10-31 22:12).
 *    사이드바를 접고 펴는 길은 이미 둘이다 — 폭 손잡이 두 번 누르기 · 가운데 탭 줄 끝의 ◧/◨.
 *
 * ⭐ 2026-11-01(W4): 아이콘을 하드코딩하지 않는다 — 뷰 등록소(listRibbonViews)를 읽어 order 순으로 줄 세운다.
 *    ⛔ 창틀은 그 아이콘이 무슨 뷰인지(도메인) 모른다 — 누르면 onOpenView(id) 로 앱에 넘긴다.
 *    「새 표 ＋」도 이제 sheet 뷰의 리본 등록일 뿐이다.
 * ⭐ 2026-11-01(W8): 아이콘을 세로로 끌어 순서를 바꾸고, 우클릭으로 끄고(숨기고) 다시 켠다.
 *    저장 배치(order·hidden)는 기기별(pane-settings.ribbon) — resolveRibbon 이 등록 목록에 얹어 준다.
 *    ⛔ 드래그 판정은 useDragLeaf 한 곳만 쓴다(세로 리스트용 axis='y') — 새 드래그 훅을 짜지 않는다.
 * 🔴 색은 토큰으로만.
 */
import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '../primitives/IconButton';
import { ContextMenu, type MenuEntry } from '../primitives/ContextMenu';
import { useDragLeaf } from '../primitives/useDragLeaf';
import {
    usePaneSettings, reorderIds, setRibbonOrder, toggleRibbonHidden, resetRibbon,
} from '../layout/pane-settings';
import { resolveRibbonEntries, useContribVersion } from '../plugin';

/** 드래그 중 포인터 자리에서 「어느 아이콘 앞/뒤에 꽂나」 — DOM 을 더듬어 번역(순수 아님, drop-resolve 와 같은 결) */
function ribbonDropAt(nav: HTMLElement | null, y: number, dragId: string):
    { targetId: string; pos: 'before' | 'after'; lineTop: number; left: number; width: number } | null {
    if (!nav) return null;
    const rows = Array.from(nav.querySelectorAll<HTMLElement>('[data-row-id]'));
    if (rows.length === 0) return null;
    for (const el of rows) {
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
            const id = el.getAttribute('data-row-id')!;
            return { targetId: id, pos: 'before', lineTop: r.top, left: r.left, width: r.width };
        }
    }
    // 전부보다 아래 → 맨 끝 뒤
    const last = rows[rows.length - 1];
    const r = last.getBoundingClientRect();
    const id = last.getAttribute('data-row-id')!;
    // 드래그 중인 자신이 맨 끝이면 미리보기를 안 그린다(제자리)
    if (id === dragId && rows.length === 1) return null;
    return { targetId: id, pos: 'after', lineTop: r.bottom, left: r.left, width: r.width };
}

export function Rail({
    onOpenView, onOpenSettings,
}: {
    /** 리본 아이콘을 눌렀을 때 — 그 뷰를 defaultArea 에 연다(앱이 정한다) */
    onOpenView: (viewId: string) => void;
    onOpenSettings: () => void;
}) {
    const { ribbon } = usePaneSettings();
    useContribVersion();   // 🔴 리본 동작·뷰가 바뀌면(플러그인 켜고 끄기) 다시 그린다
    // 🔴 뷰 설탕(「그 뷰 열기」) + 동작(명령을 가리킴)을 합쳐 order·hidden 에 태운다
    const { visible, hidden, ordered } = resolveRibbonEntries(ribbon);
    const navRef = useRef<HTMLElement>(null);
    // 🔴 드래그로 끝난 pointerup 뒤에 따라붙는 click 하나를 먹는다 — 안 그러면 재배치 끝에 그 뷰가 또 열린다.
    //    다음 눌림(pointerdown)에서 다시 false 로 — 이후의 진짜 클릭은 살아 있다.
    const draggedRef = useRef(false);
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);

    // 🔴 드롭 = 포인터를 뗀 세로 자리를 target+앞뒤로 번역 → 그 한 수를 새 순서 배열로 만들어 저장
    const onDrop = useCallback((dragId: string, _x: number, y: number) => {
        draggedRef.current = true;
        const hit = ribbonDropAt(navRef.current, y, dragId);
        if (!hit || hit.targetId === dragId) return;
        const allIds = ordered.map((v) => v.id);
        setRibbonOrder(reorderIds(allIds, dragId, hit.targetId, hit.pos));
    }, [ordered]);

    // 🔴 우클릭/길게누르기 → 그 아이콘 메뉴. el 로 어느 아이콘인지 더듬는다
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

    const { bind, drag } = useDragLeaf({ enabled: true, axis: 'y', onContext, onDrop });

    // ⭐ 리본 안에서만 아이콘 버튼이 커진다 — --s-btn 을 리본 값으로 바꿔치기한다(옵시디언 눈금).
    const preview = drag ? ribbonDropAt(navRef.current, drag.y, drag.leafId) : null;
    return (
        <nav
            ref={navRef}
            className="shrink-0 w-rail bg-panel border-r border-line flex flex-col items-center py-2 gap-1"
            style={{ '--s-btn': 'var(--s-railbtn)' } as CSSProperties}
            onPointerDownCapture={() => { draggedRef.current = false; }}
            {...bind}
        >
            {/* 위: 등록된 리본 뷰들(숨긴 것 제외) — 아이콘·순서는 등록소+기기 배치가 준다. 끌어 재배치 가능 */}
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

            {/* 드래그 오버레이 — 가로 드롭 선 + 포인터 따라다니는 고스트. pointer-events:none 로 아래 DOM 을 뚫는다 */}
            {drag && createPortal(
                <div className="ui-chrome-nodrag fixed inset-0 z-[60] pointer-events-none">
                    {preview && (
                        <div
                            className="absolute bg-accent rounded-full"
                            style={{ left: preview.left + 2, top: preview.lineTop - 1.5, width: preview.width - 4, height: 3 }}
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
