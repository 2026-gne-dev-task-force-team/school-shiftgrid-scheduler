/**
 * IconPicker — 눌러서 이모지 아이콘을 고르는 단추(자주 쓰는 것 격자 + 직접 입력 + 지우기).
 *   탭 머리에서 「아이콘·제목 바로 바꾸기」에 쓴다. 아이콘이 없으면 fallback(보통 그 화면의 기본 아이콘)을 보여 준다.
 *   🔴 색·치수는 토큰 클래스로만. ⛔ 이모지 라이브러리 안 들인다 — 격자 + 직접 입력칸이 나머지를 받는다.
 */
import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Popover } from './Popover';

export const COMMON_EMOJI = [
    '📄', '📝', '📌', '✅', '⭐', '🔥', '💡', '📊',
    '📅', '📁', '🎯', '🚀', '❤️', '⚠️', '❓', '🔖',
    '📎', '🗂️', '📈', '🧩', '🛠️', '🔑', '🏷️', '💬',
    '🧠', '📍', '🎨', '🔍', '✏️', '📦', '👥', '🚪',
];

export function IconPicker({ icon, onSetIcon, fallback, sizeClass = 'text-[22px]' }: {
    icon?: string;
    onSetIcon: (icon: string | undefined) => void;
    /** 아이콘이 없을 때 보일 것 */
    fallback: ReactNode;
    /** 이모지 글자 크기(토큰 클래스) */
    sizeClass?: string;
}) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const [custom, setCustom] = useState('');
    const close = () => { setAnchor(null); setCustom(''); };
    const choose = (e: string) => { onSetIcon(e); close(); };
    return (
        <>
            <button
                type="button"
                aria-label={icon ? '아이콘 바꾸기' : '아이콘 고르기'}
                onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
                className={`shrink-0 grid place-items-center leading-none rounded px-0.5 hover:bg-text/[0.06] ${sizeClass}`}
            >
                {icon || fallback}
            </button>
            {anchor && (
                <Popover anchor={anchor} width={264} onClose={close}>
                    <div className="grid grid-cols-8 gap-0.5 mb-2">
                        {COMMON_EMOJI.map((e) => (
                            <button key={e} type="button" onClick={() => choose(e)} className="text-[18px] rounded py-0.5 hover:bg-text/[0.1]">{e}</button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1">
                        <input
                            value={custom}
                            onChange={(e) => setCustom(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && custom.trim()) { e.preventDefault(); choose(custom.trim()); } }}
                            placeholder="직접 입력"
                            maxLength={8}
                            className="flex-1 min-w-0 rounded border border-line bg-transparent px-2 py-1 text-[13px] text-text outline-none"
                        />
                        {icon && (
                            <button type="button" onClick={() => { onSetIcon(undefined); close(); }}
                                className="flex items-center gap-1 h-btn px-2 rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.05]">
                                <Icon name="trash" size={12} /> 지우기
                            </button>
                        )}
                    </div>
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
            onBlur={done}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { (e.target as HTMLInputElement).blur(); onEnter?.(); } if (e.key === 'Escape') { setText(value); (e.target as HTMLInputElement).blur(); } }}
            className={`min-w-0 bg-transparent outline-none text-text rounded px-1 hover:bg-text/[0.04] focus:bg-text/[0.04] ${className}`}
        />
    );
}
