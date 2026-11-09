/**
 * InlineRename — 제자리 이름 고치기 칸(탐색기 줄·탭·제목 등). 뜨면 초점 + 전체 선택.
 *   Enter·blur → 확정(onCommit) · Esc → 취소(onCancel) · 🔴 한글 조합 중 Enter 는 무시(isImeEnter).
 *   값이 비었거나(공백만) 처음 값과 같으면 확정 대신 취소다 — 이름이 빈칸이 되는 일이 없다.
 *   한 번 끝나면(확정·취소) 다시 안 부른다 — Enter 뒤 언마운트로 오는 blur 가 두 번 확정하지 않게.
 */
import { useEffect, useRef, useState } from 'react';
import { isImeEnter } from './ime';
import { FOCUS_RING } from './focus';

export function InlineRename({ value, onCommit, onCancel, className = '', placeholder, ariaLabel }: {
    value: string;
    /** 다듬은(trim) 새 이름 */
    onCommit: (next: string) => void;
    onCancel: () => void;
    className?: string;
    placeholder?: string;
    ariaLabel?: string;
}) {
    const [draft, setDraft] = useState(value);
    const ref = useRef<HTMLInputElement>(null);
    const done = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.select();
    }, []);

    const finish = (commit: boolean) => {
        if (done.current) return;
        done.current = true;
        const next = (ref.current?.value ?? draft).trim();
        if (commit && next && next !== value) onCommit(next);
        else onCancel();
    };

    return (
        <input
            ref={ref}
            value={draft}
            placeholder={placeholder}
            aria-label={ariaLabel}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
                e.stopPropagation();   // 줄의 단축키(Delete·방향키 등)가 입력을 가로채지 않게
                if (e.key === 'Enter') {
                    if (isImeEnter(e)) return;
                    e.preventDefault();
                    finish(true);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    finish(false);
                }
            }}
            onBlur={() => finish(true)}
            onClick={(e) => e.stopPropagation()}
            className={`min-w-0 h-row px-1 rounded-sm border border-accent bg-bg text-text text-body outline-none ${FOCUS_RING} ${className}`}
        />
    );
}
