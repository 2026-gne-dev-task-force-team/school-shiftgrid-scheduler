/**
 * IconPicker — 눌러서 노드 아이콘(이모지 · 기본 아이콘 · 커스텀)을 고르는 단추. 탭 머리·노드 머리·칸 아이콘에서 쓴다.
 *   아이콘이 없으면 fallback(보통 그 화면의 기본 아이콘)을 보여 준다. 값은 저장 문자열 하나(옛 이모지 문자열도 그대로 읽힌다).
 *   고르기 창 본체는 node-icon/NodeIconPicker — 여기는 단추 + 팝오버만. 🔴 색·치수는 토큰 클래스로만.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** 제목 칸 찾기 선택자 — 제목 칸이 textarea 로 바뀌어도 찾는 쪽이 안 깨지게 한 자리에 둔다. */
export const TITLE_FIELD = ':is(input,textarea)[aria-label="제목"]';
import { NodeIcon } from '../node-icon/NodeIcon';
import { NodeIconPanel } from '../node-icon/NodeIconPicker';
import { Popover } from './Popover';

/** 처음 쓰던 자주 쓰는 이모지 — 다른 곳이 이 이름을 가져다 쓸 수 있어 남겨 둔다 */
export const COMMON_EMOJI = [
    '📄', '📝', '📌', '✅', '⭐', '🔥', '💡', '📊',
    '📅', '📁', '🎯', '🚀', '❤️', '⚠️', '❓', '🔖',
    '📎', '🗂️', '📈', '🧩', '🛠️', '🔑', '🏷️', '💬',
    '🧠', '📍', '🎨', '🔍', '✏️', '📦', '👥', '🚪',
];

const SIZE_OF: Record<string, number> = { 'text-2xl': 24, 'text-body': 14 };

export function IconPicker({ icon, onSetIcon, fallback, sizeClass = 'text-[22px]' }: {
    icon?: string;
    onSetIcon: (icon: string | undefined) => void;
    /** 아이콘이 없을 때 보일 것 */
    fallback: ReactNode;
    /** 단추 글자 크기(토큰 클래스) — 그림 크기도 이것에서 따른다 */
    sizeClass?: string;
}) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const close = () => setAnchor(null);
    return (
        <>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={!!anchor}
                aria-label={icon ? '아이콘 바꾸기' : '아이콘 고르기'}
                onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
                className={`hit-44 relative shrink-0 grid place-items-center leading-none rounded px-0.5 hover:bg-text/[0.06] ${anchor ? 'bg-text/[0.1]' : ''} ${sizeClass} ${sizeClass === 'text-2xl' ? 'h-[1.25em]' : ''}`}   // 제목 한 줄(leading-tight=1.25)과 같은 높이 — 단차 없이 가운데 정렬(K19)
            >
                <NodeIcon value={icon} size={SIZE_OF[sizeClass] ?? 22} fallback={fallback} />
            </button>
            {anchor && <IconPickerPopover anchor={anchor} icon={icon} onSetIcon={onSetIcon} onClose={close} />}
        </>
    );
}

/** 아이콘 고르기 팝오버 — 노드 머리의 IconPicker 와 탐색기 줄이 같이 쓴다(새 부품 없음). 고르면 값을 넘기고 닫는다. */
export function IconPickerPopover({ anchor, icon, onSetIcon, onClose }: {
    anchor: DOMRect;
    icon?: string;
    onSetIcon: (icon: string | undefined) => void;
    onClose: () => void;
}) {
    return (
        <Popover anchor={anchor} width={296} onClose={onClose}>
            <NodeIconPanel value={icon} onPick={(v) => { onSetIcon(v); onClose(); }} />
        </Popover>
    );
}

/** 제목 칸을 글 높이에 맞춘다 — 한 줄이면 한 줄, 길면 아래로 늘어난다(노션 제목처럼). */
function fitHeight(el: HTMLTextAreaElement | null): void {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
}

/**
 * 탭 머리 제목 칸 — 고치고 Enter·포커스 빠질 때 한 번 넘긴다(빈 값은 무시). 밖에서 이름이 바뀌면 따라간다.
 * 🔴 긴 제목은 잘리지 않고 줄을 넘긴다(쥔님 11-10 「컬렉션 이름 길면 제목 줄 깨짐」) — 그래서 한 줄 input 이 아니라
 *    글 높이에 맞춰 늘어나는 textarea 다. 이름은 한 줄 값이라 Enter 는 줄을 안 넣고 확정 · 붙여넣은 줄바꿈은 빈칸으로.
 *    찾는 쪽은 `TITLE_FIELD` 선택자를 쓴다(⛔ `input[aria-label=…]` 로 찾지 말 것).
 */
export function TitleField({ value, onRename, className = '', label, ariaLabel, placeholder, onEnter }: {
    value: string;
    onRename: (name: string) => void;
    className?: string;
    /** 스크린리더용 이름(기본 「제목」) */
    label?: string;
    /** @deprecated label */
    ariaLabel?: string;
    placeholder?: string;
    /** Enter 로 확정한 뒤 불린다(본문으로 캐럿 넘기기 등). IME 조합 중 Enter 는 안 불린다. */
    onEnter?: () => void;
}) {
    const [text, setText] = useState(value);
    const [seen, setSeen] = useState(value);
    if (seen !== value) { setSeen(value); setText(value); }
    const done = () => { const t = text.trim(); if (t && t !== value) onRename(t); else setText(value); };
    const ref = useRef<HTMLTextAreaElement>(null);
    // 글이 바뀔 때 · 칸 폭이 바뀔 때(창 가르기·패널 접기) 높이를 다시 맞춘다
    useLayoutEffect(() => { fitHeight(ref.current); }, [text]);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        let w = el.clientWidth;
        const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fitHeight(el); } });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return (
        // oxlint-disable-next-line react/forbid-elements -- 제목 칸 자체 — 글 높이에 맞춰 늘어나는 한 값 입력(부품 Input 은 한 줄 고정)
        <textarea
            ref={ref}
            rows={1}
            value={text}
            aria-label={label ?? ariaLabel ?? '제목'}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
            onFocus={(e) => { if (/^페이지( \d+)?$/.test(value)) e.currentTarget.select(); }}   // 새로 만든 기본 이름이면 전체 선택 — 입력이 뒤에 안 붙는다
            onBlur={done}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); onEnter?.(); }
                if (e.key === 'Escape') { setText(value); e.currentTarget.blur(); }
            }}
            className={`block min-w-0 resize-none overflow-hidden break-keep [overflow-wrap:anywhere] bg-transparent outline-none text-text rounded px-1 hover:bg-text/[0.04] focus:bg-text/[0.04] ${className}`}
        />
    );
}
