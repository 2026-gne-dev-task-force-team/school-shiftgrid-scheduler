/**
 * Dialog — 가운데 모달. 바깥 클릭·Esc 에 닫힌다(onClose). 손으로 `fixed inset-0` 을 짜지 말고 이걸 쓴다.
 *   title 은 머리글이자 접근성 이름(aria-label). footer 는 단추 줄(오른쪽 정렬) — 보통 Button 들.
 * 🔴 색은 토큰으로만 · window.alert/confirm 대신 이것(ConfirmDialog)을 쓴다. 열린 동안만 그린다(open 이 false 면 null).
 *
 * 초점(R1, 2026-11-09):
 *   - 열릴 때 한 번만 잡는다 — 자식 autoFocus 가 이미 잡았으면 존중, 아니면 [autofocus]·첫 입력칸, 없으면 패널.
 *     🔴 효과는 open 에만 건다. onClose 는 ref 로 읽는다 — 부모가 인라인 onClose 로 다시 그려도 입력 중 초점을 안 뺏는다.
 *   - Tab/Shift+Tab 은 패널 안에서 돈다(초점 가두기).
 *   - 닫히면 연 자리(열기 직전 activeElement)로 초점이 돌아간다.
 *   - Esc 는 떠 있는 층 줄(layers.ts)로 — 안에서 연 팝오버가 있으면 그것만 닫힌다.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { pushEscapeLayer } from './layers';

const TABBABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
const FIELD = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),textarea:not([disabled]),select:not([disabled]),[contenteditable="true"]';

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
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        if (!open) return;
        // 연 자리 — 자식 autoFocus 가 먼저 돌았으면 activeElement 는 이미 안쪽이다. 그땐 relatedTarget 대신 기록해 둔 걸 쓴다.
        const panel = ref.current;
        const active = document.activeElement as HTMLElement | null;
        const opener = panel && active && panel.contains(active) ? lastOutside : active;
        if (panel && !panel.contains(document.activeElement)) {
            const first = panel.querySelector<HTMLElement>('[autofocus]') ?? panel.querySelector<HTMLElement>(FIELD);
            (first ?? panel).focus();
        }
        const popEsc = pushEscapeLayer(() => closeRef.current());
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Tab' || !ref.current) return;
            const items = [...ref.current.querySelectorAll<HTMLElement>(TABBABLE)];
            if (items.length === 0) { e.preventDefault(); ref.current.focus(); return; }
            const firstEl = items[0];
            const lastEl = items[items.length - 1];
            const cur = document.activeElement;
            const inside = !!cur && ref.current.contains(cur) && cur !== ref.current;
            if (e.shiftKey && (cur === firstEl || !inside)) { e.preventDefault(); lastEl.focus(); }
            else if (!e.shiftKey && (cur === lastEl || !inside)) { e.preventDefault(); firstEl.focus(); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
            popEsc();
            window.removeEventListener('keydown', onKey, true);
            // 연 자리가 아직 화면에 있으면 거기로 돌려준다
            if (opener && opener !== document.body && opener.isConnected) opener.focus?.();
        };
    }, [open]);

    if (!open) return null;
    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-text/30 select-none ui-fade-in"
            onPointerDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}
        >
            <div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                style={{ width, maxWidth: 'calc(100vw - 1.5rem)', transformOrigin: 'center' }}
                className="flex flex-col gap-3 rounded-lg border border-line bg-panel shadow-lg p-4 text-text outline-none ui-pop-in"
            >
                <h3 className="text-lead font-semibold">{title}</h3>
                {children && <div className="text-body">{children}</div>}
                {footer && <div className="flex items-center justify-end gap-2">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}

/*
 * 자식 autoFocus 는 Dialog 효과보다 먼저 초점을 옮긴다 — 그러면 효과에서 「연 자리」를 못 읽는다.
 * 그래서 문서의 focusin 을 지켜 「대화창 바깥에서 마지막으로 초점을 가졌던 칸」을 기억해 둔다(리스너 하나, 첫 import 때).
 */
let lastOutside: HTMLElement | null = null;
if (typeof document !== 'undefined') {
    document.addEventListener('focusout', (e) => {
        const t = e.target as HTMLElement | null;
        if (t && !t.closest?.('[role="dialog"]')) lastOutside = t;
    }, true);
}
