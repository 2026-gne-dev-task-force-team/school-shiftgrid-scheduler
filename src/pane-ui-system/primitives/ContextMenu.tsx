/**
 * 우클릭 메뉴 — 마우스 자리에 뜨는 작은 목록. 바깥 클릭·Esc·스크롤에 닫히고, 화면 가장자리에서 안으로 밀려 들어온다.
 *
 * 🔴 ⭐ 「무엇이 우클릭인가」 판정은 useContextTrigger(옆 파일) 한 곳에만 산다 (쥔님 지시 2026-10-31).
 * 🔴 색·치수는 토큰 클래스로만. 메뉴는 portal 로 body 에 띄운다(패널 overflow 에 안 잘리게).
 * ⭐ 키보드(R1): 뜨면 첫 항목에 초점 · ↑↓/Home/End 이동 · Enter 실행 · Esc 닫기 · 닫히면 열기 전 초점 자리로 돌아간다.
 *    항목 꼴은 Menu.tsx(MenuItem) 한 벌 — Popover 안 메뉴와 같은 꼴이다.
 */
import type { JsonValue } from '../json';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IconName } from './Icon';
import { MenuList, MenuItem, MenuSeparator } from './Menu';
import { useExitClose } from './presence';
import { pushEscapeLayer, useLayerToken } from './layers';

/** 메뉴 항목이 가리키는 명령 맥락(어느 탭/묶음/노드 + 데이터). ContextMenu 는 뜻을 모르고 onCommand 로 넘길 뿐이다.
 *  plugin CommandContext 와 같은 꼴(층을 안 거스르려 여기 따로 적는다 · 구조적으로 같다). */
export interface MenuCommandArg { leafId?: string; tabsId?: string; nodeId?: string; nodeIds?: string[]; args?: JsonValue }

export type MenuEntry =
    | { sep: true }
    | {
        sep?: false;
        label: string;
        icon?: IconName;
        /** 오른쪽 회색 단축키 글자(보여주기만) */
        shortcut?: string;
        disabled?: boolean;
        /** 'danger' 면 위험색 */
        tone?: 'danger';
        /** @deprecated tone: 'danger' */
        danger?: boolean;
        /** 🔴 동작은 commandId 로 — ContextMenu 가 onCommand(id, arg) 로 부른다(「모든 동작은 명령」). */
        commandId?: string;
        commandArg?: MenuCommandArg;
        /** 명령으로 못 옮긴 창틀 내부용 직접 핸들러(플러그인 콘텐츠 메뉴 등). commandId 가 있으면 그게 이긴다. */
        onClick?: () => void;
    };

const GAP = 6;

export function ContextMenu({ x, y, items, onClose: onCloseProp, onCommand }: {
    x: number;
    y: number;
    items: MenuEntry[];
    onClose: () => void;
    /** 🔴 commandId 가 있는 항목을 누르면 이걸로 부른다(shell 이 runCommand 를 주입). 없으면 onClick 폴백. */
    onCommand?: (id: string, arg?: MenuCommandArg) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const { closing, close: onClose } = useExitClose(onCloseProp);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const layer = useLayerToken();
    // 연 자리 — 렌더에서 잡는다(첫 항목 autoFocus 가 효과보다 먼저 초점을 옮긴다)
    const [opener] = useState(() => (typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null));
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

    // 바깥 클릭·Esc·바깥 스크롤·크기변경에 닫는다 · 닫히면 연 자리로 초점을 돌려준다
    useEffect(() => {
        const close = () => closeRef.current();
        const onDown = (e: PointerEvent) => {
            if (!ref.current?.contains(e.target as Node)) close();
        };
        // 스크롤은 capture 로 — 안쪽 어느 영역이 스크롤돼도 메뉴 자리가 어긋나기 전에 닫는다(메뉴 안쪽 스크롤은 빼고)
        const onScroll = (e: Event) => { if (!(e.target instanceof Node && ref.current?.contains(e.target))) close(); };
        const popEsc = pushEscapeLayer(close, layer);
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', close);
        return () => {
            popEsc();
            document.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', close);
            // 메뉴가 일으킨 일(피크·팝오버·편집 입력)이 초점을 가져갔으면 뺏지 않는다 — BODY 로 빠졌을 때만 돌려준다
            const a = document.activeElement;
            if ((!a || a === document.body) && opener && opener !== document.body && opener.isConnected) opener.focus?.({ preventScroll: true });
        };
    }, [layer, opener]);

    return createPortal(
        <div
            ref={ref}
            className={`fixed z-popover min-w-[180px] max-w-[260px] py-1 rounded-md border border-line bg-panel shadow-lg select-none ${closing ? 'ui-pop-out pointer-events-none' : 'ui-pop-in'}`}
            style={{ left: pos.x, top: pos.y }}
        >
            <MenuList autoFocus>
                {items.map((it, i) => (
                    it.sep
                        ? <MenuSeparator key={`s${i}`} />
                        : (
                            <MenuItem
                                key={it.label + i}
                                label={it.label}
                                icon={it.icon}
                                shortcut={it.shortcut}
                                tone={it.tone}
                                danger={it.danger}
                                disabled={it.disabled}
                                onSelect={() => {
                                    if (it.commandId && onCommand) onCommand(it.commandId, it.commandArg);
                                    else it.onClick?.();
                                    closeRef.current();
                                }}
                            />
                        )
                ))}
            </MenuList>
        </div>,
        document.body,
    );
}
