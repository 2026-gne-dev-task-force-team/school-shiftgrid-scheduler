/**
 * Dialog — 가운데 모달. 바깥 클릭·Esc 에 닫힌다(onClose). 손으로 `fixed inset-0` 을 짜지 말고 이걸 쓴다.
 *   title 은 머리글이자 접근성 이름(aria-label). footer 는 단추 줄(오른쪽 정렬) — 보통 Button 들.
 * 🔴 색은 토큰으로만 · window.alert/confirm 대신 이것(ConfirmDialog)을 쓴다. 열린 동안만 그린다(open 이 false 면 null).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Dialog({ open = true, title, onClose, children, footer, width = 360 }: {
    open?: boolean;
    title: string;
    onClose: () => void;
    children?: ReactNode;
    footer?: ReactNode;
    /** px — 좁은 화면에선 화면 폭에 맞춰 줄어든다 */
    width?: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', onKey, true);
        ref.current?.focus();
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, onClose]);
    if (!open) return null;
    return createPortal(
        <div
            className="fixed inset-0 z-[260] flex items-center justify-center bg-text/30 select-none"
            onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                style={{ width, maxWidth: 'calc(100vw - 1.5rem)' }}
                className="flex flex-col gap-3 rounded-lg border border-line bg-panel shadow-lg p-4 text-text outline-none"
            >
                <h3 className="text-lead font-semibold">{title}</h3>
                {children && <div className="text-body">{children}</div>}
                {footer && <div className="flex items-center justify-end gap-2">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}
