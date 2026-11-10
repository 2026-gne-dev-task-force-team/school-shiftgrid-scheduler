/**
 * InlineRename — 제자리 이름 고치기 칸(탐색기 줄·탭·제목 등). 뜨면 초점 + 전체 선택.
 *   Enter·blur → 확정(onCommit) · Esc → 취소(onCancel) · 🔴 한글 조합 중 Enter 는 무시(isImeEnter).
 *   값이 비었거나(공백만) 처음 값과 같으면 확정 대신 취소다 — 이름이 빈칸이 되는 일이 없다(raw 면 그대로 확정).
 *   한 번 끝나면(확정·취소) 다시 안 부른다 — Enter 뒤 언마운트로 오는 blur 가 두 번 확정하지 않게.
 */
import { useEffect, useRef, useState } from 'react';
import { isImeEnter } from './ime';
import { FOCUS_RING } from './focus';

export function InlineRename({ value, onCommit, onCancel, className = '', placeholder, label, ariaLabel, raw = false, autoFocus = true }: {
    value: string;
    /** 다듬은(trim) 새 이름 */
    onCommit: (next: string) => void;
    onCancel: () => void;
    className?: string;
    placeholder?: string;
    /** 스크린리더용 이름 */
    label?: string;
    /** @deprecated label */
    ariaLabel?: string;
    /** 참이면 빈 값·처음과 같은 값도 그대로 확정한다(이름이 아니라 「값 입력」 — 링크 칸처럼 빈 값·그대로 두기도 뜻이 있다). Esc 만 취소. */
    raw?: boolean;
    /** 뜰 때 초점+전체 선택(기본 켬). 메뉴 안처럼 다른 걸 먼저 칠 수 있는 자리는 끈다 */
    autoFocus?: boolean;
}) {
    const [draft, setDraft] = useState(value);
    const ref = useRef<HTMLInputElement>(null);
    const done = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || !autoFocus) return;
        el.focus();
        el.select();
    }, [autoFocus]);

    const finish = (commit: boolean) => {
        if (done.current) return;
        done.current = true;
        const next = (ref.current?.value ?? draft).trim();
        if (commit && (raw || (next && next !== value))) onCommit(raw ? (ref.current?.value ?? draft) : next);
        else onCancel();
    };

    return (
        <input
            ref={ref}
            value={draft}
            placeholder={placeholder}
            aria-label={label ?? ariaLabel}
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
