/**
 * IconPicker — 눌러서 노드 아이콘(이모지 · 기본 아이콘 · 커스텀)을 고르는 단추. 탭 머리·노드 머리·칸 아이콘에서 쓴다.
 *   아이콘이 없으면 fallback(보통 그 화면의 기본 아이콘)을 보여 준다. 값은 저장 문자열 하나(옛 이모지 문자열도 그대로 읽힌다).
 *   고르기 창 본체는 node-icon/NodeIconPicker — 여기는 단추 + 팝오버만. 🔴 색·치수는 토큰 클래스로만.
 */
import { useState, type ReactNode } from 'react';
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
                className={`hit-44 relative shrink-0 grid place-items-center leading-none rounded px-0.5 hover:bg-text/[0.06] ${anchor ? 'bg-text/[0.1]' : ''} ${sizeClass}`}
            >
                <NodeIcon value={icon} size={SIZE_OF[sizeClass] ?? 22} fallback={fallback} />
            </button>
            {anchor && (
                <Popover anchor={anchor} width={296} onClose={close}>
                    <NodeIconPanel value={icon} onPick={(v) => { onSetIcon(v); close(); }} />
                </Popover>
            )}
        </>
    );
}

/** 탭 머리 제목 칸 — 고치고 Enter·포커스 빠질 때 한 번 넘긴다(빈 값은 무시). 밖에서 이름이 바뀌면 따라간다. */
export function TitleField({ value, onRename, className = '', ariaLabel = '제목', placeholder, onEnter }: {
    value: string;
    onRename: (name: string) => void;
    className?: string;
    ariaLabel?: string;
    placeholder?: string;
    /** Enter 로 확정한 뒤 불린다(본문으로 캐럿 넘기기 등). IME 조합 중 Enter 는 안 불린다. */
    onEnter?: () => void;
}) {
    const [text, setText] = useState(value);
    const [seen, setSeen] = useState(value);
    if (seen !== value) { setSeen(value); setText(value); }
    const done = () => { const t = text.trim(); if (t && t !== value) onRename(t); else setText(value); };
    return (
        <input
            value={text}
            aria-label={ariaLabel}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => { if (/^페이지( \d+)?$/.test(value)) e.currentTarget.select(); }}   // 새로 만든 기본 이름이면 전체 선택 — 입력이 뒤에 안 붙는다
            onBlur={done}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { (e.target as HTMLInputElement).blur(); onEnter?.(); } if (e.key === 'Escape') { setText(value); (e.target as HTMLInputElement).blur(); } }}
            className={`min-w-0 bg-transparent outline-none text-text rounded px-1 hover:bg-text/[0.04] focus:bg-text/[0.04] ${className}`}
        />
    );
}
