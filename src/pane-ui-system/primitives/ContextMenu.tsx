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
import { MenuList, MenuItem, MenuSeparator, handleMenuKey } from './Menu';
import { useExitClose } from './presence';
import { pushEscapeLayer, useLayerToken } from './layers';

/** 메뉴 항목이 가리키는 명령 맥락(어느 탭/묶음/노드 + 데이터). ContextMenu 는 뜻을 모르고 onCommand 로 넘길 뿐이다.
 *  plugin CommandContext 와 같은 꼴(층을 안 거스르려 여기 따로 적는다 · 구조적으로 같다). */
export interface MenuCommandArg { leafId?: string; tabsId?: string; nodeId?: string; nodeIds?: string[]; args?: JsonValue }

/** 항목 묶음 키 — 노드 메뉴(nodeMenu)가 이 순서로 모으고 묶음 사이에 구분선을 넣는다. 없으면 타입 menu 는 'edit'. */
export type MenuGroup = 'open' | 'new' | 'edit' | 'move' | 'danger';

export type MenuEntry =
    /** 구분선 — label 이 있으면 「묶음 머리」(작은 회색 글자) */
    | { sep: true; label?: string }
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
        /** 하위 메뉴 — 있으면 이 줄은 실행 대신 마우스를 올리거나 → 키로 오른쪽에 펼친다. */
        children?: MenuEntry[];
        /** 묶음 키(꾸러미가 menu 항목에 달면 그 묶음 자리로 간다) */
        group?: MenuGroup;
    };

const GAP = 6;

interface ContextMenuProps {
    x: number;
    y: number;
    items: MenuEntry[];
    onClose: () => void;
    /** 🔴 commandId 가 있는 항목을 누르면 이걸로 부른다(shell 이 runCommand 를 주입). 없으면 onClick 폴백. */
    onCommand?: (id: string, arg?: MenuCommandArg) => void;
}

/** 🔴 자리가 바뀌면 새 메뉴다 — key 로 갈아 끼운다. Esc 로 닫는 중(퇴장 120ms)에 새 우클릭이 오면
 *  같은 인스턴스가 「닫는 중」 상태 그대로 새 자리를 받아, 곧 닫힘 콜백이 새 메뉴를 꺼 버렸다(첫 우클릭이 안 먹는 것처럼 보임). */
export function ContextMenu(props: ContextMenuProps) {
    return <ContextMenuInner key={`${props.x},${props.y}`} {...props} />;
}

function ContextMenuInner({ x, y, items, onClose: onCloseProp, onCommand }: ContextMenuProps) {
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
        if (ny + r.height > window.innerHeight - GAP) ny = window.innerHeight - r.height - GAP;   // 높이는 max-height 로 이미 뷰포트 안
        setPos({ x: Math.max(GAP, nx), y: Math.max(GAP, ny) });
    }, [x, y]);

    // 바깥 클릭·Esc·바깥 스크롤·크기변경에 닫는다 · 닫히면 연 자리로 초점을 돌려준다
    useEffect(() => {
        const close = () => closeRef.current();
        const onDown = (e: PointerEvent) => {
            const t = e.target as Element;
            if (!ref.current?.contains(t) && !t.closest?.('[data-ctx-sub]')) close();
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
            className={`fixed z-popover min-w-[180px] max-w-[260px] py-1 overflow-y-auto rounded-md border border-line bg-panel shadow-lg select-none ${closing ? 'ui-pop-out pointer-events-none' : 'ui-pop-in'}`}
            style={{ left: pos.x, top: pos.y, maxHeight: `calc(100vh - ${GAP * 2}px)` }}
        >
            <MenuList autoFocus>
                <Entries items={items} onCommand={onCommand} close={() => closeRef.current()} />
            </MenuList>
        </div>,
        document.body,
    );
}

interface EntriesProps { items: MenuEntry[]; onCommand?: ContextMenuProps['onCommand']; close: () => void }

function Entries({ items, onCommand, close }: EntriesProps) {
    return (
        <>
            {items.map((it, i) => {
                if (it.sep) {
                    return it.label
                        ? <div key={`h${i}`} role="separator" className="mt-1 px-pad pt-1.5 pb-0.5 border-t border-line text-small text-muted truncate">{it.label}</div>
                        : <MenuSeparator key={`s${i}`} />;
                }
                if (it.children?.length) return <SubMenuItem key={it.label + i} it={it} onCommand={onCommand} close={close} />;
                return (
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
                            close();
                        }}
                    />
                );
            })}
        </>
    );
}

/** 하위 메뉴가 있는 줄 — 올리면(0.15초 뒤 닫힘 유예) · 누르면 · → 키로 오른쪽에 펼친다. ← 로 접고 이 줄로 돌아온다. 오른쪽 자리가 모자라면 왼쪽으로. */
function SubMenuItem({ it, onCommand, close }: { it: Extract<MenuEntry, { sep?: false }> } & Omit<EntriesProps, 'items'>) {
    const wrap = useRef<HTMLDivElement>(null);
    const sub = useRef<HTMLDivElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [open, setOpen] = useState(false);
    const [at, setAt] = useState({ x: 0, y: 0 });
    const show = () => {
        clearTimeout(timer.current);
        const r = wrap.current?.getBoundingClientRect();
        if (r) setAt({ x: r.right, y: r.top });
        setOpen(true);
    };
    const hideSoon = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 150); };
    useEffect(() => () => clearTimeout(timer.current), []);
    // 펼쳐진 뒤 크기를 재서 넘치면 왼쪽·위로 민다
    useLayoutEffect(() => {
        if (!open || !sub.current || !wrap.current) return;
        const r = sub.current.getBoundingClientRect();
        const w = wrap.current.getBoundingClientRect();
        let x = w.right;
        let y = w.top;
        if (x + r.width > window.innerWidth - GAP) x = Math.max(GAP, w.left - r.width);
        if (y + r.height > window.innerHeight - GAP) y = Math.max(GAP, window.innerHeight - r.height - GAP);
        if (x !== at.x || y !== at.y) setAt({ x, y });
    }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
    const focusParent = () => wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return (
        <div
            ref={wrap}
            onPointerEnter={show}
            onPointerLeave={hideSoon}
            onKeyDown={(e) => {
                if (e.key === 'ArrowRight' && !open) { e.preventDefault(); e.stopPropagation(); show(); setTimeout(() => sub.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus(), 0); }
                else if (e.key === 'ArrowLeft' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); focusParent(); }
            }}
        >
            <MenuItem
                label={it.label}
                icon={it.icon}
                disabled={it.disabled}
                onSelect={() => { show(); setTimeout(() => sub.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus(), 0); }}
            >
                <span className="shrink-0 pl-3 text-small text-muted" aria-hidden>▸</span>
            </MenuItem>
            {open && createPortal(
                <div
                    ref={sub}
                    data-ctx-sub
                    role="menu"
                    aria-label={it.label}
                    className="fixed z-popover py-1 overflow-y-auto rounded-md border border-line bg-panel shadow-lg select-none ui-pop-in"
                    style={{ left: at.x, top: at.y, minWidth: 160, maxWidth: 260, maxHeight: `calc(100vh - ${GAP * 2}px)` }}
                    onPointerEnter={() => clearTimeout(timer.current)}
                    onPointerLeave={hideSoon}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') { e.preventDefault(); setOpen(false); focusParent(); }
                        else if (handleMenuKey(e, sub.current)) { /* 처리됨 */ }
                        e.stopPropagation();
                    }}
                >
                    <Entries items={it.children!} onCommand={onCommand} close={close} />
                </div>,
                document.body,
            )}
        </div>
    );
}
