/**
 * 작은 떠 있는 메뉴 — 머리(행·열) 우클릭 때 뜬다. 플러그인은 창틀의 ContextMenu 를 못 집으니(구조 검사 ⑥)
 *   표 편집기가 제 것을 가진다. 색·치수는 토큰 클래스로만(구조 검사 ①). 바깥 클릭·Esc 에 닫힌다.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
    label: string;
    danger?: boolean;
    onClick: () => void;
}

export function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
    useEffect(() => {
        const down = (e: PointerEvent) => {
            if (!(e.target as HTMLElement)?.closest('[data-table-menu]')) onClose();
        };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('pointerdown', down, true);
        window.addEventListener('keydown', esc, true);
        return () => {
            document.removeEventListener('pointerdown', down, true);
            window.removeEventListener('keydown', esc, true);
        };
    }, [onClose]);

    return createPortal(
        <div
            data-table-menu
            role="menu"
            className="fixed z-[200] min-w-[160px] py-1 rounded-md border border-line bg-panel shadow-lg select-none"
            style={{ left: x, top: y }}
        >
            {items.map((it, i) => (
                <button
                    key={it.label + i}
                    type="button"
                    role="menuitem"
                    onClick={() => { it.onClick(); onClose(); }}
                    className={`w-full h-row px-pad text-[13px] text-left transition-colors
                        ${it.danger ? 'text-bad hover:bg-bad/10' : 'text-text hover:bg-text/[0.06]'}`}
                >
                    {it.label}
                </button>
            ))}
        </div>,
        document.body,
    );
}
