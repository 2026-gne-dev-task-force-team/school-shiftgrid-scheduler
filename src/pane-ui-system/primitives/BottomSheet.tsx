/**
 * 바텀 시트 — 화면 아래에서 올라오는 덮개. 좁은 화면 전용 조각이다.
 *   ⭐ 탭 전환(TabSwitcher)이 이 안에 살고, 나중에 피크(W9)도 같은 껍데기를 쓴다 — 그래서 조각으로 뺐다.
 *   ⛔ 무엇을 담는지는 모른다(children 만 받는다). 색·치수는 토큰으로만.
 *
 * 🔴 나갈 때도 밀려 내려가게 — 언마운트를 애니메이션 끝까지 미룬다(SidePanel 서랍과 같은 장치).
 *    「움직임 줄이기」면 애니메이션이 없으니 바로 접는다(접근성).
 * 🔴 바깥 막을 누르거나 Esc 로 닫힌다. 손잡이·스크롤은 안쪽이 쥔다.
 */
import { useEffect, useState, type ReactNode } from 'react';

export function BottomSheet({
    open, onClose, children, label = '시트',
}: {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    /** 스크린리더용 이름 — ⛔ 도메인 이름을 박지 않는다(호스트가 준다) */
    label?: string;
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
        if (!open) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [open, onClose]);

    if (!rendered) return null;
    const sheetAnim = closing ? 'sheet-out' : 'sheet-in';
    const scrimAnim = closing ? 'drawer-scrim-out' : 'drawer-scrim';
    return (
        <div className="fixed inset-0 z-[160] flex flex-col justify-end select-none">
            <button
                className={`absolute inset-0 bg-black/40 ${scrimAnim}`}
                onClick={onClose}
                aria-label={`${label} 닫기`}
            />
            <div
                role="dialog"
                aria-label={label}
                className={`ui-chrome-nodrag relative bg-panel border-t border-line rounded-t-2xl shadow-lg
                    max-h-[75vh] flex flex-col ${sheetAnim}`}
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                {/* 손잡이 — 끌어 내리는 자리(아직 「자리만」, W11 에서 끌림을 단다) */}
                <div className="shrink-0 grid place-items-center pt-2.5 pb-1.5">
                    <span className="block w-10 h-1 rounded-full bg-line" />
                </div>
                <div className="flex-1 min-h-0 overflow-auto">{children}</div>
            </div>
        </div>
    );
}
