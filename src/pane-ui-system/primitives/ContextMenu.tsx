/**
 * 우클릭 메뉴 — 마우스 자리에 뜨는 작은 목록. 바깥 클릭·Esc·스크롤에 닫히고, 화면 가장자리에서 안으로 밀려 들어온다.
 *
 * 🔴 ⭐ 「무엇이 우클릭인가」 판정은 useContextTrigger(옆 파일) 한 곳에만 산다 (쥔님 지시 2026-10-31).
 * 🔴 색·치수는 토큰 클래스로만. 메뉴는 portal 로 body 에 띄운다(패널 overflow 에 안 잘리게).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

/** 메뉴 항목이 가리키는 명령 맥락(어느 탭/묶음). ContextMenu 는 뜻을 모르고 onCommand 로 넘길 뿐이다. */
export interface MenuCommandArg { leafId?: string; tabsId?: string }

export type MenuEntry =
    | { sep: true }
    | {
        sep?: false;
        label: string;
        icon?: IconName;
        disabled?: boolean;
        danger?: boolean;
        /** 🔴 동작은 commandId 로 — ContextMenu 가 onCommand(id, arg) 로 부른다(「모든 동작은 명령」). */
        commandId?: string;
        commandArg?: MenuCommandArg;
        /** 명령으로 못 옮긴 창틀 내부용 직접 핸들러(플러그인 콘텐츠 메뉴 등). commandId 가 있으면 그게 이긴다. */
        onClick?: () => void;
    };

const GAP = 6;

export function ContextMenu({ x, y, items, onClose, onCommand }: {
    x: number;
    y: number;
    items: MenuEntry[];
    onClose: () => void;
    /** 🔴 commandId 가 있는 항목을 누르면 이걸로 부른다(shell 이 runCommand 를 주입). 없으면 onClick 폴백. */
    onCommand?: (id: string, arg?: MenuCommandArg) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x, y });

    // 화면 밖으로 넘치면 안으로 민다 — 뜬 뒤 크기를 재서 자리를 고친다
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        let nx = x;
        let ny = y;
        if (nx + r.width > window.innerWidth - GAP) nx = window.innerWidth - r.width - GAP;
        if (ny + r.height > window.innerHeight - GAP) ny = window.innerHeight - r.height - GAP;
        setPos({ x: Math.max(GAP, nx), y: Math.max(GAP, ny) });
    }, [x, y]);

    // 바깥 클릭·Esc·스크롤·크기변경에 닫는다
    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            if (!ref.current?.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        // 스크롤은 capture 로 — 안쪽 어느 영역이 스크롤돼도 메뉴 자리가 어긋나기 전에 닫는다
        const onScroll = () => onClose();
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={ref}
            role="menu"
            className="fixed z-[200] min-w-[180px] max-w-[260px] py-1 rounded-md border border-line bg-panel shadow-lg select-none"
            style={{ left: pos.x, top: pos.y }}
        >
            {items.map((it, i) => (
                it.sep
                    ? <div key={`s${i}`} className="my-1 h-px bg-line" role="separator" />
                    : (
                        <button
                            key={it.label + i}
                            type="button"
                            role="menuitem"
                            disabled={it.disabled}
                            onClick={() => {
                                if (it.disabled) return;
                                if (it.commandId && onCommand) onCommand(it.commandId, it.commandArg);
                                else it.onClick?.();
                                onClose();
                            }}
                            className={`w-full flex items-center gap-2 h-row px-pad text-[13px] text-left transition-colors
                                ${it.disabled
                                    ? 'text-muted/40 cursor-default'
                                    : it.danger
                                        ? 'text-bad hover:bg-bad/10'
                                        : 'text-text hover:bg-text/[0.06]'}`}
                        >
                            <span className="w-4 shrink-0 grid place-items-center">
                                {it.icon && <Icon name={it.icon} size={14} />}
                            </span>
                            <span className="flex-1 min-w-0 truncate">{it.label}</span>
                        </button>
                    )
            ))}
        </div>,
        document.body,
    );
}
