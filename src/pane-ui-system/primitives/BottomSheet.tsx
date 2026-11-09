/**
 * 바텀 시트 — 화면 아래에서 올라오는 덮개. 좁은 화면 전용 조각이다.
 *   ⭐ 탭 전환(TabSwitcher)이 이 안에 살고, 피크(W9)도 같은 껍데기를 쓴다 — 그래서 조각으로 뺐다.
 *   ⛔ 무엇을 담는지는 모른다(children 만 받는다). 색·치수는 토큰으로만.
 *
 * 🔴 나갈 때도 밀려 내려가게 — 언마운트를 애니메이션 끝까지 미룬다(SidePanel 서랍과 같은 장치).
 *    「움직임 줄이기」면 애니메이션이 없으니 바로 접는다(접근성).
 * 🔴 기본은 바깥 막·Esc 로 닫힌다(탭 전환). 피크는 그 둘을 끈다(쥔님: "안 닫힌다") — dismissOnScrim·dismissOnEsc.
 * 🔴 높이는 기본 max-h-[75vh] 지만, heightVh 를 주면 그 높이로 선다(피크의 두 단 snap 을 바깥이 쥔다).
 *    손잡이에 끌림을 달 땐 gripProps 를 넘긴다 — 조각은 「무슨 snap 인지」를 모른다(계산은 layout/mobile).
 */
import { useEffect, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

export function BottomSheet({
    open, onClose, children, label = '시트',
    dismissOnScrim = true,
    dismissOnEsc = true,
    heightVh,
    heightSmooth = false,
    gripProps,
    gripActive = false,
}: {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    /** 스크린리더용 이름 — ⛔ 도메인 이름을 박지 않는다(호스트가 준다) */
    label?: string;
    /** 바깥 막을 눌러 닫히나(기본 참). 피크는 거짓 — 막은 보이되 안 닫힌다 */
    dismissOnScrim?: boolean;
    /** Esc 로 닫히나(기본 참). 피크는 거짓 */
    dismissOnEsc?: boolean;
    /** 시트 높이(화면 대비 vh). 주면 그 높이로 선다(안 주면 max-h-[75vh] 로 내용 높이만큼) */
    heightVh?: number;
    /** 높이가 바뀔 때 미끄러지나(snap 확정에만 켠다 · 손가락 따라가는 중엔 끈다) */
    heightSmooth?: boolean;
    /** 손잡이에 얹을 포인터 핸들러 — 끌어 올리고 내리는 손짓(피크). 안 주면 손잡이는 장식 */
    gripProps?: HTMLAttributes<HTMLDivElement>;
    /** 끌고 있는 동안이면 손잡이를 짙게(피드백) */
    gripActive?: boolean;
}) {
    const [rendered, setRendered] = useState(open);
    const closing = rendered && !open;

    useEffect(() => {
        if (open) { setRendered(true); return; }
        if (!rendered) return;
        const reduce = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { setRendered(false); return; }
        const t = window.setTimeout(() => setRendered(false), 220);   // .2s 애니메이션 + 여유
        return () => clearTimeout(t);
    }, [open, rendered]);

    useEffect(() => {
        if (!open || !dismissOnEsc) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [open, dismissOnEsc, onClose]);

    if (!rendered) return null;
    const sheetAnim = closing ? 'sheet-out' : 'sheet-in';
    const scrimAnim = closing ? 'drawer-scrim-out' : 'drawer-scrim';
    const panelStyle: CSSProperties = {
        paddingBottom: 'env(safe-area-inset-bottom)',
        ...(heightVh != null ? { height: `${heightVh}vh` } : {}),
    };
    return (
        <div className="fixed inset-0 z-sheet flex flex-col justify-end select-none">
            <button
                className={`absolute inset-0 bg-black/40 ${scrimAnim}`}
                onClick={dismissOnScrim ? onClose : undefined}
                aria-label={`${label} 닫기`}
                // 🔴 안 닫히는 막(피크)은 눌러도 반응이 없어야 한다 — 포인터는 받되 아무 일도 안 한다
                aria-disabled={!dismissOnScrim}
                tabIndex={dismissOnScrim ? 0 : -1}
            />
            <div
                role="dialog"
                aria-label={label}
                className={`ui-chrome-nodrag relative bg-panel border-t border-line rounded-t-2xl shadow-lg
                    ${heightVh != null ? '' : 'max-h-[75vh]'} flex flex-col ${sheetAnim} ${heightSmooth ? 'pane-htrans' : ''}`}
                style={panelStyle}
            >
                {/* 손잡이 — 끌어 올리고 내리는 자리(gripProps 가 있으면 끌림이 산다) */}
                <div
                    className="shrink-0 grid place-items-center pt-2.5 pb-1.5 touch-none cursor-grab"
                    {...gripProps}
                >
                    <span className={`block w-10 h-1 rounded-full ${gripActive ? 'bg-muted' : 'bg-line'}`} />
                </div>
                <div className="flex-1 min-h-0 overflow-auto">{children}</div>
            </div>
        </div>
    );
}
