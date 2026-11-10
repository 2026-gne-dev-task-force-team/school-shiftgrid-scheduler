/**
 * MenuList · MenuItem · MenuSeparator — 메뉴 항목 꼴 한 벌. ContextMenu 가 이걸로 그리고, Popover 안 메뉴도 이걸 담는다.
 *   항목: 아이콘 칸(4) · 이름(말줄임) · 단축키(오른쪽 회색) · 위험색(danger) · 끔(disabled).
 *   키보드(MenuList): ↑↓ 다음/이전(끝에서 돈다) · Home/End 처음/끝 · Enter·Space 실행 · autoFocus 면 첫 항목에 초점.
 * 🔴 색·치수는 토큰 클래스로만. 메뉴 항목 단추는 이 파일 한 곳에서만 짠다(손으로 메뉴 단추를 짜지 말 것).
 */
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

const ITEM = '[role="menuitem"]:not([disabled])';

function items(root: HTMLElement | null): HTMLElement[] {
    return root ? [...root.querySelectorAll<HTMLElement>(ITEM)] : [];
}

/** 메뉴 안 방향키 이동 — MenuList 가 쓰고, 다른 컨테이너에서도 onKeyDown 으로 붙일 수 있다. 처리했으면 true. */
export function handleMenuKey(e: KeyboardEvent<HTMLElement> | globalThis.KeyboardEvent, root: HTMLElement | null): boolean {
    const list = items(root);
    if (list.length === 0) return false;
    const cur = list.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = cur < 0 ? 0 : (cur + 1) % list.length;
    else if (e.key === 'ArrowUp') next = cur < 0 ? list.length - 1 : (cur - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if ((e.key === 'Enter' || e.key === ' ') && cur >= 0) {
        e.preventDefault();
        list[cur].click();
        return true;
    } else return false;
    e.preventDefault();
    list[next].focus();
    return true;
}

export function MenuList({ children, autoFocus = false, className = '', label }: {
    children?: ReactNode;
    /** 뜨자마자 첫 항목에 초점(키보드로 바로 고르게) */
    autoFocus?: boolean;
    className?: string;
    /** 접근성 이름 */
    label?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (autoFocus) items(ref.current)[0]?.focus();
    }, [autoFocus]);
    return (
        <div
            ref={ref}
            role="menu"
            aria-label={label}
            className={`flex flex-col outline-none ${className}`}
            onKeyDown={(e) => { if (handleMenuKey(e, ref.current)) e.stopPropagation(); }}
        >
            {children}
        </div>
    );
}

export function MenuItem({ label, icon, shortcut, tone, danger = false, disabled = false, onSelect, children }: {
    label: string;
    icon?: IconName;
    /** 오른쪽 회색 글자(⌘D 등) — 보여주기만 한다 */
    shortcut?: string;
    /** 'danger' 면 위험색(되돌리기 힘든 일) */
    tone?: 'danger';
    /** @deprecated tone="danger" */
    danger?: boolean;
    disabled?: boolean;
    onSelect: () => void;
    /** 이름 오른쪽에 덧붙일 것(꼬리표 등) */
    children?: ReactNode;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            disabled={disabled}
            tabIndex={-1}
            onClick={() => { if (!disabled) onSelect(); }}
            className={`w-full flex items-center gap-2 h-row px-pad text-body text-left whitespace-nowrap transition-colors duration-fast outline-none
                ${disabled
                    ? 'text-muted/40 cursor-default'
                    : (tone === 'danger' || danger)
                        ? 'text-bad hover:bg-bad/10 focus:bg-bad/10'
                        : 'text-text hover:bg-text/[0.06] focus:bg-text/[0.06]'}`}
        >
            <span className="w-4 shrink-0 grid place-items-center">
                {icon && <Icon name={icon} size={14} />}
            </span>
            <span className="flex-1 min-w-0 truncate">{label}</span>
            {children}
            {shortcut && <span className="shrink-0 pl-3 text-small text-muted">{shortcut}</span>}
        </button>
    );
}

export function MenuSeparator() {
    return <div className="my-1 h-px bg-line" role="separator" />;
}
